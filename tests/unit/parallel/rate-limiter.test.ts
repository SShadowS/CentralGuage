/**
 * Unit tests for ProviderRateLimiter
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertExists } from "@std/assert";
import {
  getGlobalRateLimiter,
  ProviderRateLimiter,
  resetGlobalRateLimiter,
} from "../../../src/parallel/rate-limiter.ts";
import type { ProviderLimits } from "../../../src/parallel/types.ts";

describe("ProviderRateLimiter", () => {
  let rateLimiter: ProviderRateLimiter;

  beforeEach(() => {
    rateLimiter = new ProviderRateLimiter();
  });

  describe("constructor", () => {
    it("should initialize with default limits", () => {
      const status = rateLimiter.getStatus("mock");

      assertEquals(status.maxConcurrent, 100);
      assertEquals(status.isLimited, false);
    });

    it("should accept custom limits", () => {
      const customLimits = new Map<string, ProviderLimits>();
      customLimits.set("custom", { concurrent: 5, rpm: 30, tpm: 50000 });

      const limiter = new ProviderRateLimiter(customLimits);
      const status = limiter.getStatus("custom");

      assertEquals(status.maxConcurrent, 5);
    });
  });

  describe("tryAcquire()", () => {
    it("should acquire a lease when not limited", () => {
      const lease = rateLimiter.tryAcquire("mock");

      assertExists(lease);
      assertEquals(lease.provider, "mock");
      assertExists(lease.id);
      assertExists(lease.acquiredAt);
    });

    it("should return null when concurrent limit reached", () => {
      // Set a low concurrent limit
      rateLimiter.setLimits("test-provider", {
        concurrent: 2,
        rpm: 999,
        tpm: 999999,
      });

      // Acquire up to limit
      const lease1 = rateLimiter.tryAcquire("test-provider");
      const lease2 = rateLimiter.tryAcquire("test-provider");
      const lease3 = rateLimiter.tryAcquire("test-provider");

      assertExists(lease1);
      assertExists(lease2);
      assertEquals(lease3, null);
    });

    it("should track estimated tokens", () => {
      const lease = rateLimiter.tryAcquire("mock", 1000);

      assertExists(lease);
      assertEquals(lease.estimatedTokens, 1000);
    });
  });

  describe("acquire()", () => {
    it("should return a lease immediately when not limited", async () => {
      const lease = await rateLimiter.acquire("mock");

      assertExists(lease);
      assertEquals(lease.provider, "mock");
    });

    it("should include estimated tokens when provided", async () => {
      const lease = await rateLimiter.acquire("mock", 500);

      assertExists(lease);
      assertEquals(lease.estimatedTokens, 500);
    });
  });

  describe("release()", () => {
    it("should release a lease and update stats", () => {
      const lease = rateLimiter.tryAcquire("mock");
      assertExists(lease);

      const statusBefore = rateLimiter.getStatus("mock");
      assertEquals(statusBefore.currentConcurrent, 1);

      rateLimiter.release(lease);

      const statusAfter = rateLimiter.getStatus("mock");
      assertEquals(statusAfter.currentConcurrent, 0);
    });

    it("should update token usage when actual differs from estimated", () => {
      const lease = rateLimiter.tryAcquire("mock", 500);
      assertExists(lease);

      rateLimiter.release(lease, 1000);

      const status = rateLimiter.getStatus("mock");
      assertEquals(status.tokensThisMinute, 1000);
    });

    it("should handle releasing lease not in pool", () => {
      const fakeLease = {
        id: "fake-lease",
        provider: "mock",
        acquiredAt: new Date(),
      };

      // Should not throw
      rateLimiter.release(fakeLease);
    });
  });

  describe("getStatus()", () => {
    it("should return correct status for provider", () => {
      rateLimiter.tryAcquire("mock");
      rateLimiter.tryAcquire("mock");

      const status = rateLimiter.getStatus("mock");

      assertEquals(status.provider, "mock");
      assertEquals(status.currentConcurrent, 2);
      assertEquals(status.requestsThisMinute, 2);
      assertEquals(status.isLimited, false);
    });

    it("should return status for unknown provider with defaults", () => {
      const status = rateLimiter.getStatus("unknown-provider");

      assertExists(status);
      assertEquals(status.currentConcurrent, 0);
    });
  });

  describe("getAllStatus()", () => {
    it("should return status for all active providers", () => {
      rateLimiter.tryAcquire("mock");
      rateLimiter.tryAcquire("anthropic");

      const allStatus = rateLimiter.getAllStatus();

      assert(allStatus.has("mock"));
      assert(allStatus.has("anthropic"));
    });
  });

  describe("updateFromError()", () => {
    it("should set backoff when rate limited", () => {
      rateLimiter.tryAcquire("mock"); // Initialize state
      rateLimiter.updateFromError("mock", 5000, true);

      const status = rateLimiter.getStatus("mock");
      assert(status.backoffRemaining > 0);
      assert(status.backoffRemaining <= 5000);
    });

    it("should use exponential backoff when no retry-after", () => {
      rateLimiter.tryAcquire("mock");
      rateLimiter.updateFromError("mock", undefined, true);

      const status = rateLimiter.getStatus("mock");
      assert(status.backoffRemaining > 0);
    });

    it("should increase backoff multiplier on repeated errors", () => {
      rateLimiter.tryAcquire("mock");

      // First error - 1s backoff
      rateLimiter.updateFromError("mock", undefined, true);
      const status1 = rateLimiter.getStatus("mock");

      // Wait a bit and trigger another error
      rateLimiter.updateFromError("mock", undefined, true);
      const status2 = rateLimiter.getStatus("mock");

      // Second backoff should be longer (exponential)
      assert(status2.backoffRemaining >= status1.backoffRemaining);
    });
  });

  describe("reset()", () => {
    it("should reset state for a provider", () => {
      rateLimiter.tryAcquire("mock");
      rateLimiter.tryAcquire("mock");

      rateLimiter.reset("mock");

      const status = rateLimiter.getStatus("mock");
      assertEquals(status.currentConcurrent, 0);
      assertEquals(status.requestsThisMinute, 0);
    });
  });

  describe("resetAll()", () => {
    it("should reset state for all providers", () => {
      rateLimiter.tryAcquire("mock");
      rateLimiter.tryAcquire("anthropic");

      rateLimiter.resetAll();

      assertEquals(rateLimiter.getAllStatus().size, 0);
    });
  });

  describe("setLimits()", () => {
    it("should update limits for a provider", () => {
      rateLimiter.setLimits("custom", {
        concurrent: 10,
        rpm: 100,
        tpm: 200000,
      });

      const status = rateLimiter.getStatus("custom");
      assertEquals(status.maxConcurrent, 10);
    });
  });

  describe("RPM limiting", () => {
    it("should track requests per minute", () => {
      rateLimiter.setLimits("test", { concurrent: 100, rpm: 5, tpm: 999999 });

      for (let i = 0; i < 5; i++) {
        const lease = rateLimiter.tryAcquire("test");
        assertExists(lease);
        rateLimiter.release(lease);
      }

      const status = rateLimiter.getStatus("test");
      assertEquals(status.requestsThisMinute, 5);
    });
  });

  describe("TPM limiting", () => {
    it("should track tokens per minute", () => {
      rateLimiter.setLimits("test", { concurrent: 100, rpm: 999, tpm: 5000 });

      const lease = rateLimiter.tryAcquire("test", 3000);
      assertExists(lease);
      rateLimiter.release(lease, 3000);

      const status = rateLimiter.getStatus("test");
      assertEquals(status.tokensThisMinute, 3000);
    });
  });
});

describe("Global Rate Limiter", () => {
  afterEach(() => {
    resetGlobalRateLimiter();
  });

  describe("getGlobalRateLimiter()", () => {
    it("should return a rate limiter instance", () => {
      const limiter = getGlobalRateLimiter();

      assertExists(limiter);
      assert(limiter instanceof ProviderRateLimiter);
    });

    it("should return the same instance on repeated calls", () => {
      const limiter1 = getGlobalRateLimiter();
      const limiter2 = getGlobalRateLimiter();

      assertEquals(limiter1, limiter2);
    });
  });

  describe("resetGlobalRateLimiter()", () => {
    it("should reset and clear the global instance", () => {
      const limiter1 = getGlobalRateLimiter();
      limiter1.tryAcquire("mock");

      resetGlobalRateLimiter();

      const limiter2 = getGlobalRateLimiter();
      const status = limiter2.getStatus("mock");

      // Should be a new instance with fresh state
      assertEquals(status.currentConcurrent, 0);
    });
  });
});

describe("Rate Limiter Concurrent Access", () => {
  it("should handle multiple concurrent acquires correctly", async () => {
    const limiter = new ProviderRateLimiter();
    limiter.setLimits("test", { concurrent: 5, rpm: 999, tpm: 999999 });

    // Acquire 5 leases concurrently
    const promises = Array.from({ length: 5 }, () => limiter.acquire("test"));
    const leases = await Promise.all(promises);

    assertEquals(leases.filter((l) => l !== null).length, 5);

    // 6th acquire should wait (or return null for tryAcquire)
    const sixthLease = limiter.tryAcquire("test");
    assertEquals(sixthLease, null);

    // Release one
    const firstLease = leases[0];
    if (firstLease) {
      limiter.release(firstLease);
    }

    // Now we should be able to acquire again
    const newLease = limiter.tryAcquire("test");
    assertExists(newLease);
  });
});
