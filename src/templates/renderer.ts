import { exists } from "@std/fs";
import { join } from "@std/path";

export interface TemplateContext {
  [key: string]: string | number | boolean | undefined;
}

export class TemplateRenderer {
  private templateCache = new Map<string, string>();
  private templateDir: string;

  constructor(templateDir: string = "templates") {
    this.templateDir = templateDir;
  }

  async loadTemplate(templateName: string): Promise<string> {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    const templatePath = join(this.templateDir, templateName);
    if (!await exists(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    const content = await Deno.readTextFile(templatePath);
    this.templateCache.set(templateName, content);
    return content;
  }

  async render(templateName: string, context: TemplateContext): Promise<string> {
    const template = await this.loadTemplate(templateName);
    return this.renderString(template, context);
  }

  renderString(template: string, context: TemplateContext): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = context[key];
      if (value === undefined || value === null) {
        console.warn(`Template variable '${key}' is undefined, leaving placeholder`);
        return match; // Keep the placeholder if variable is missing
      }
      return String(value);
    });
  }

  // Enhanced rendering with conditionals and loops
  renderAdvanced(template: string, context: TemplateContext): string {
    let result = template;

    // Handle conditionals: {{#if variable}}content{{/if}}
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
      const value = context[key];
      return value ? content : "";
    });

    // Handle inverse conditionals: {{#unless variable}}content{{/unless}}
    result = result.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (match, key, content) => {
      const value = context[key];
      return !value ? content : "";
    });

    // Handle simple loops: {{#each items}}{{.}}{{/each}} - for arrays of strings
    result = result.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
      const value = context[key];
      if (Array.isArray(value)) {
        return value.map(item => content.replace(/\{\{\.\}\}/g, String(item))).join("");
      }
      return "";
    });

    // Handle basic variable substitution
    result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = context[key];
      if (value === undefined || value === null) {
        return match;
      }
      return String(value);
    });

    return result;
  }

  clearCache(): void {
    this.templateCache.clear();
  }

  // Validate template syntax
  validateTemplate(template: string): string[] {
    const errors: string[] = [];
    const variables = template.match(/\{\{(\w+)\}\}/g) || [];
    const conditionals = template.match(/\{\{#(if|unless)\s+\w+\}\}/g) || [];
    const loops = template.match(/\{\{#each\s+\w+\}\}/g) || [];

    // Check for unmatched conditionals
    const ifCount = (template.match(/\{\{#if\s+\w+\}\}/g) || []).length;
    const endIfCount = (template.match(/\{\{\/if\}\}/g) || []).length;
    if (ifCount !== endIfCount) {
      errors.push(`Unmatched {{#if}} blocks: ${ifCount} opening, ${endIfCount} closing`);
    }

    const unlessCount = (template.match(/\{\{#unless\s+\w+\}\}/g) || []).length;
    const endUnlessCount = (template.match(/\{\{\/unless\}\}/g) || []).length;
    if (unlessCount !== endUnlessCount) {
      errors.push(`Unmatched {{#unless}} blocks: ${unlessCount} opening, ${endUnlessCount} closing`);
    }

    const eachCount = (template.match(/\{\{#each\s+\w+\}\}/g) || []).length;
    const endEachCount = (template.match(/\{\{\/each\}\}/g) || []).length;
    if (eachCount !== endEachCount) {
      errors.push(`Unmatched {{#each}} blocks: ${eachCount} opening, ${endEachCount} closing`);
    }

    return errors;
  }

  // Extract required variables from template
  getRequiredVariables(template: string): string[] {
    const variables = new Set<string>();
    
    // Basic variables
    const basicMatches = template.match(/\{\{(\w+)\}\}/g) || [];
    basicMatches.forEach(match => {
      const variable = match.replace(/[{}]/g, "");
      if (!variable.startsWith("#") && variable !== ".") {
        variables.add(variable);
      }
    });

    // Conditional variables
    const conditionalMatches = template.match(/\{\{#(if|unless)\s+(\w+)\}\}/g) || [];
    conditionalMatches.forEach(match => {
      const variable = match.replace(/\{\{#(if|unless)\s+(\w+)\}\}/, "$2");
      variables.add(variable);
    });

    // Loop variables
    const loopMatches = template.match(/\{\{#each\s+(\w+)\}\}/g) || [];
    loopMatches.forEach(match => {
      const variable = match.replace(/\{\{#each\s+(\w+)\}\}/, "$1");
      variables.add(variable);
    });

    return Array.from(variables).sort();
  }
}