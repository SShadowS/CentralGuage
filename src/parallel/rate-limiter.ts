/**
 * Per-provider rate limiting with token bucket algorithm
 * Handles concurrent requests, RPM, and TPM limits
 */

import type { ProviderLimits, RateLease, RateLimiterStatus } from "./types.ts";
import { DEFAULT_PROVIDER_LIMITS } from "./types.ts";

/**
 * Internal state for a provider
 */
interface ProviderState {
  /** Currently active leases */
  activeLeases: Map<string, RateLease>;

  /** Timestamps of requests in current minute window */
  requestTimestamps: number[];

  /** Tokens used in current minute window */
  tokenUsage: Array<{ timestamp: number; tokens: number }>;

  /** Current backoff end time (0 if not in backoff) */
  backoffUntil: number;

  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;

  /** Waiters for available slots */
  waiters: Array<{
    resolve: (lease: RateLease) => void;
    reject: (error: Error) => void;
  }>;
}

/**
 * Provider-specific rate limiter
 */
export class ProviderRateLimiter {
  private limits: Map<string, ProviderLimits>;
  private state: Map<string, ProviderState>;
  private leaseCounter = 0;

  constructor(customLimits?: Map<string, ProviderLimits>) {
    this.limits = new Map([
      ...Object.entries(DEFAULT_PROVIDER_LIMITS),
      ...(customLimits ? customLimits.entries() : []),
    ]);
    this.state = new Map();
  }

  /**
   * Get or create state for a provider
   */
  private getState(provider: string): ProviderState {
    let state = this.state.get(provider);
    if (!state) {
      state = {
        activeLeases: new Map(),
        requestTimestamps: [],
        tokenUsage: [],
        backoffUntil: 0,
        backoffMultiplier: 1,
        waiters: [],
      };
      this.state.set(provider, state);
    }
    return state;
  }

  /**
   * Get limits for a provider (uses defaults if not specified)
   */
  private getLimits(provider: string): ProviderLimits {
    return (
      this.limits.get(provider) ||
      this.limits.get("mock") || { concurrent: 5, rpm: 60, tpm: 100000 }
    );
  }

  /**
   * Clean up old timestamps outside the current minute window
   */
  private cleanupTimestamps(state: ProviderState): void {
    const oneMinuteAgo = Date.now() - 60000;
    state.requestTimestamps = state.requestTimestamps.filter(
      (ts) => ts > oneMinuteAgo,
    );
    state.tokenUsage = state.tokenUsage.filter(
      (usage) => usage.timestamp > oneMinuteAgo,
    );
  }

  /**
   * Check if currently rate limited
   */
  private isLimited(provider: string): {
    limited: boolean;
    reason?: string;
    waitMs?: number;
  } {
    const state = this.getState(provider);
    const limits = this.getLimits(provider);
    const now = Date.now();

    // Check backoff
    if (state.backoffUntil > now) {
      return {
        limited: true,
        reason: "backoff",
        waitMs: state.backoffUntil - now,
      };
    }

    // Clean up old timestamps
    this.cleanupTimestamps(state);

    // Check concurrent limit
    if (state.activeLeases.size >= limits.concurrent) {
      // Wait for a lease to be released - no specific wait time
      return {
        limited: true,
        reason: "concurrent",
      };
    }

    // Check RPM limit
    if (state.requestTimestamps.length >= limits.rpm) {
      const oldestTimestamp = state.requestTimestamps[0] ?? now;
      const waitMs = oldestTimestamp + 60000 - now;
      return {
        limited: true,
        reason: "rpm",
        waitMs: Math.max(0, waitMs),
      };
    }

    // Check TPM limit
    const tokensThisMinute = state.tokenUsage.reduce(
      (sum, u) => sum + u.tokens,
      0,
    );
    if (tokensThisMinute >= limits.tpm) {
      const oldestUsage = state.tokenUsage[0] ?? { timestamp: now };
      const waitMs = oldestUsage.timestamp + 60000 - now;
      return {
        limited: true,
        reason: "tpm",
        waitMs: Math.max(0, waitMs),
      };
    }

    return { limited: false };
  }

  /**
   * Acquire a lease for making an LLM request
   * Blocks until a slot is available
   */
  async acquire(
    provider: string,
    estimatedTokens?: number,
  ): Promise<RateLease> {
    const state = this.getState(provider);

    // Check if we can acquire immediately
    const limitCheck = this.isLimited(provider);

    if (!limitCheck.limited) {
      return this.createLease(provider, estimatedTokens);
    }

    // If there's a known wait time, wait for it
    if (limitCheck.waitMs && limitCheck.waitMs > 0) {
      await this.delay(limitCheck.waitMs);
      // Re-check after waiting
      return this.acquire(provider, estimatedTokens);
    }

    // Otherwise, wait for a slot to become available
    return new Promise((resolve, reject) => {
      state.waiters.push({
        resolve: (lease) => resolve(lease),
        reject,
      });
    });
  }

  /**
   * Try to acquire a lease without blocking
   * Returns null if no slot available
   */
  tryAcquire(provider: string, estimatedTokens?: number): RateLease | null {
    const limitCheck = this.isLimited(provider);
    if (limitCheck.limited) {
      return null;
    }
    return this.createLease(provider, estimatedTokens);
  }

  /**
   * Create a new lease
   */
  private createLease(provider: string, estimatedTokens?: number): RateLease {
    const state = this.getState(provider);
    const now = Date.now();

    const lease: RateLease = {
      id: `lease_${++this.leaseCounter}_${now}`,
      provider,
      acquiredAt: new Date(),
    };

    // Add estimatedTokens only if provided
    if (estimatedTokens !== undefined) {
      lease.estimatedTokens = estimatedTokens;
    }

    // Record the lease
    state.activeLeases.set(lease.id, lease);
    state.requestTimestamps.push(now);

    if (estimatedTokens) {
      state.tokenUsage.push({ timestamp: now, tokens: estimatedTokens });
    }

    return lease;
  }

  /**
   * Release a lease after request completes
   */
  release(lease: RateLease, actualTokens?: number): void {
    const state = this.getState(lease.provider);

    // Remove the lease
    state.activeLeases.delete(lease.id);

    // Update token usage if actual differs from estimated
    if (actualTokens !== undefined && lease.estimatedTokens !== actualTokens) {
      // Find and update the token usage entry
      const now = Date.now();
      const existingIdx = state.tokenUsage.findIndex(
        (u) =>
          u.tokens === lease.estimatedTokens &&
          Math.abs(u.timestamp - lease.acquiredAt.getTime()) < 1000,
      );
      const existingEntry = existingIdx !== -1
        ? state.tokenUsage[existingIdx]
        : undefined;
      if (existingEntry) {
        existingEntry.tokens = actualTokens;
      } else if (actualTokens > 0) {
        state.tokenUsage.push({ timestamp: now, tokens: actualTokens });
      }
    }

    // Reset backoff on successful release (assumes success)
    state.backoffMultiplier = 1;

    // Try to satisfy waiters
    this.processWaiters(lease.provider);
  }

  /**
   * Process waiting acquirers after a lease is released
   */
  private processWaiters(provider: string): void {
    const state = this.getState(provider);

    while (state.waiters.length > 0) {
      const limitCheck = this.isLimited(provider);
      if (limitCheck.limited) {
        break;
      }

      const waiter = state.waiters.shift();
      if (waiter) {
        const lease = this.createLease(provider);
        waiter.resolve(lease);
      }
    }
  }

  /**
   * Update rate limiter state based on an error response (e.g., 429)
   */
  updateFromError(
    provider: string,
    retryAfterMs?: number,
    isRateLimit = true,
  ): void {
    const state = this.getState(provider);
    const now = Date.now();

    if (isRateLimit) {
      // Use retry-after if provided, otherwise exponential backoff
      if (retryAfterMs && retryAfterMs > 0) {
        state.backoffUntil = now + retryAfterMs;
      } else {
        // Exponential backoff: 1s, 2s, 4s, 8s, max 60s
        const backoffMs = Math.min(
          1000 * state.backoffMultiplier,
          60000,
        );
        state.backoffUntil = now + backoffMs;
        state.backoffMultiplier = Math.min(state.backoffMultiplier * 2, 64);
      }
    }
  }

  /**
   * Get current status for a provider
   */
  getStatus(provider: string): RateLimiterStatus {
    const state = this.getState(provider);
    const limits = this.getLimits(provider);
    const now = Date.now();

    this.cleanupTimestamps(state);

    const tokensThisMinute = state.tokenUsage.reduce(
      (sum, u) => sum + u.tokens,
      0,
    );

    return {
      provider,
      currentConcurrent: state.activeLeases.size,
      maxConcurrent: limits.concurrent,
      requestsThisMinute: state.requestTimestamps.length,
      tokensThisMinute,
      isLimited: this.isLimited(provider).limited,
      backoffRemaining: Math.max(0, state.backoffUntil - now),
    };
  }

  /**
   * Get status for all providers
   */
  getAllStatus(): Map<string, RateLimiterStatus> {
    const result = new Map<string, RateLimiterStatus>();
    for (const provider of this.state.keys()) {
      result.set(provider, this.getStatus(provider));
    }
    return result;
  }

  /**
   * Reset state for a provider
   */
  reset(provider: string): void {
    this.state.delete(provider);
  }

  /**
   * Reset all state
   */
  resetAll(): void {
    this.state.clear();
  }

  /**
   * Update limits for a provider
   */
  setLimits(provider: string, limits: ProviderLimits): void {
    this.limits.set(provider, limits);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Global rate limiter instance (singleton)
 */
let globalRateLimiter: ProviderRateLimiter | null = null;

/**
 * Get or create the global rate limiter
 */
export function getGlobalRateLimiter(): ProviderRateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new ProviderRateLimiter();
  }
  return globalRateLimiter;
}

/**
 * Reset the global rate limiter (for testing)
 */
export function resetGlobalRateLimiter(): void {
  globalRateLimiter?.resetAll();
  globalRateLimiter = null;
}
