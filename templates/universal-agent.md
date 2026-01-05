# {{TASK_ID}}: AL Code Generation Task

## Your Role

You are an AL code generator for Microsoft Dynamics 365 Business Central. You will write AL code, compile it using provided tools, and iterate until successful.

## Available Tools

### al_compile

**Purpose**: Compile AL code in a Business Central container
**Parameters**: `projectDir` (string) - Path to directory with app.json and .al files
**Returns**:

```json
{
  "success": true/false,
  "message": "Compilation successful" or error description,
  "errors": ["error1", "error2"],
  "warnings": ["warning1"]
}
```

### al_verify_task

**Purpose**: Compile and run benchmark tests for the task
**Parameters**:

- `projectDir` (string) - Path to project directory
- `taskId` (string) - Task ID (e.g., "{{TASK_ID}}")

**Returns**:

```json
{
  "success": true/false,
  "message": "All tests passed!" or failure description,
  "totalTests": 5,
  "passed": 5,
  "failed": 0,
  "failures": ["TestName: error message"]
}
```

---

## Task Description

{{TASK_DESCRIPTION}}

---

## Workspace

**Directory**: `{{WORKSPACE_PATH}}`

Create ALL files directly in this directory (no subdirectories):

- `app.json` - Required manifest
- `*.al` - AL source files

---

## Workflow

### PHASE 1: Create Files

1. Create `app.json` manifest:

```json
{
  "id": "{{APP_GUID}}",
  "name": "Task App",
  "publisher": "CentralGauge",
  "version": "1.0.0.0",
  "platform": "27.0.0.0",
  "application": "27.0.0.0",
  "idRanges": [{ "from": 70000, "to": 79999 }],
  "runtime": "16.0",
  "features": ["NoImplicitWith"]
}
```

2. Create `.al` files implementing the requirements

### PHASE 2: Compile (MANDATORY)

3. Call `al_compile` with `projectDir: "{{WORKSPACE_PATH}}"`
4. If `success: false`:
   - Read the error messages carefully
   - **IMPORTANT**: If the error is about a missing object that was described as "existing" in the task (e.g., "Table 'Product Category' not found"), this is EXPECTED - skip to Phase 3 (al_verify_task) immediately. The prereq will be provided there.
   - For other errors: Fix your code and call `al_compile` again
5. Repeat until `success: true` OR you get a prereq-related error (then skip to Phase 3)

{{#if REQUIRES_TESTS}}
### PHASE 3: Run Tests (MANDATORY)

6. Once compilation succeeds, call `al_verify_task` with:
   - `projectDir: "{{WORKSPACE_PATH}}"`
   - `taskId: "{{TASK_ID}}"`
7. If `success: false`:
   - Read the failure messages
   - Fix your code
   - Call `al_compile` to verify it compiles
   - Call `al_verify_task` again
8. Repeat until `success: true` with "All tests passed!"
{{/if}}

---

## Success Criteria

{{#if REQUIRES_TESTS}}
**Task is COMPLETE only when:**

1. `al_compile` returns `{ "success": true }`
2. `al_verify_task` returns `{ "success": true }` with "All tests passed!"

**Task FAILS if you:**

- Only create files without calling `al_compile`
- Compilation succeeds but you skip `al_verify_task`
- Exit before receiving `success: true` from `al_verify_task`
{{/if}}
{{#unless REQUIRES_TESTS}}
**Task is COMPLETE only when:**

- `al_compile` returns `{ "success": true }` with "Compilation successful"

**Task FAILS if you:**

- Only create files without calling `al_compile`
- Exit before receiving `success: true` from `al_compile`
{{/unless}}

---

## CRITICAL: Tool Calls Required

**FILE CREATION IS NOT COMPLETION**

You MUST call tools to complete this task:

1. Call `al_compile` after creating/modifying files
{{#if REQUIRES_TESTS}}
2. Call `al_verify_task` after compilation succeeds
{{/if}}
3. Iterate on errors until you get `success: true`

Do NOT stop after creating files. The compile tool determines success.

---

## AL Coding Guidelines

- Use PascalCase for all identifiers
- Include proper `Caption` for user-facing elements
- Set `DataClassification` for all fields
- Use ID range 70000-79999 for generated objects
- Follow BC naming conventions

## IMPORTANT: Existing Objects (Prereqs)

When the task description mentions an **"existing"** object (table, enum, interface, etc.):

- **DO NOT create that object** - it will be provided automatically during `al_verify_task`
- Only create the objects specifically requested in the task
- Reference the existing object by its name/ID as described

For example, if the task says "create a page based on the existing Product Category table (ID 69001)":
- Create ONLY the page - the table is provided as a dependency
- Your code should reference `SourceTable = "Product Category"` without creating the table itself
- Initial `al_compile` may show "table not found" - this is expected for prereq objects
- The `al_verify_task` tool will include the prereq, making your page compile and run tests

---

## REQUIRED: Final Output Format

When you complete the task (or if it fails), you MUST output this exact summary format at the end:

{{#if REQUIRES_TESTS}}
```
Compile: Success
Tests: X/Y
Result: Pass
```

Where:
- `Compile:` is "Success" or "Failed"
- `Tests:` is "passed/total" (e.g., "7/7" or "5/7")
- `Result:` is "Pass" if compile succeeded AND all tests passed, otherwise "Fail"
{{/if}}
{{#unless REQUIRES_TESTS}}
```
Compile: Success
Result: Pass
```

Where:
- `Compile:` is "Success" or "Failed"
- `Result:` is "Pass" if compile succeeded, otherwise "Fail"
{{/unless}}

**This format is machine-parsed. Output it exactly as shown.**
