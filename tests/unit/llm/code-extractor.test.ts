import { describe, it } from "@std/testing/bdd";
import { assertEquals, assert } from "@std/assert";
import { CodeExtractor } from "../../../src/llm/code-extractor.ts";

describe("CodeExtractor", () => {
  describe("extract()", () => {
    describe("AL code extraction", () => {
      it("should extract AL code from custom delimiters", () => {
        const response = `
Here's the AL code solution:

BEGIN-CODE
codeunit 50100 "Test Codeunit"
{
    procedure CalculateTotal(Amount: Decimal): Decimal
    begin
        exit(Amount * 1.1);
    end;
}
END-CODE

This code calculates the total with tax.`;

        const result = CodeExtractor.extract(response, "al");
        
        assertEquals(result.language, "al");
        assertEquals(result.extractedFromDelimiters, true);
        assertEquals(result.confidence, 0.95);
        assert(result.code.includes("codeunit 50100"));
        assert(!result.code.includes("BEGIN-CODE"));
        assert(!result.code.includes("END-CODE"));
      });

      it("should extract AL code from markdown code blocks", () => {
        const response = `
Here's the solution:

\`\`\`al
table 50100 "Customer Extension"
{
    fields
    {
        field(1; "Entry No."; Integer)
        {
            AutoIncrement = true;
        }
    }
}
\`\`\``;

        const result = CodeExtractor.extract(response, "al");
        
        assertEquals(result.language, "al");
        assertEquals(result.extractedFromDelimiters, true);
        assertEquals(result.confidence, 0.9);
        assert(result.code.includes("table 50100"));
        assert(!result.code.includes("```"));
      });

      it("should extract AL code from various markdown language hints", () => {
        const languages = ["csharp", "c#", "cs", "pascal"];
        
        languages.forEach(lang => {
          const response = `\`\`\`${lang}
procedure TestProc()
begin
    Message('Hello');
end;
\`\`\``;

          const result = CodeExtractor.extract(response, "al");
          assertEquals(result.language, "al");
          assertEquals(result.confidence, 0.9);
          assert(result.code.includes("procedure TestProc"));
        });
      });

      it("should detect AL code from patterns without delimiters", () => {
        const response = `codeunit 50100 "Inventory Manager"
{
    trigger OnRun()
    begin
        Message('Running inventory check');
    end;
    
    var
        ItemRec: Record Item;
}`;

        const result = CodeExtractor.extract(response, "al");
        
        assertEquals(result.language, "al");
        assertEquals(result.confidence, 0.7);
        assert(result.code.includes("codeunit 50100"));
      });

      it("should handle empty or invalid responses", () => {
        const emptyResult = CodeExtractor.extract("", "al");
        assertEquals(emptyResult.confidence, 0.1);
        assertEquals(emptyResult.code, "");

        const invalidResult = CodeExtractor.extract("This is just plain text", "al");
        assert(invalidResult.confidence <= 0.3);
      });
    });

    describe("Diff extraction", () => {
      it("should extract diff from custom delimiters", () => {
        const response = `
Here's the diff for the changes:

BEGIN-DIFF
--- a/file.al
+++ b/file.al
@@ -1,5 +1,5 @@
 codeunit 50100 "Test"
 {
-    procedure OldName()
+    procedure NewName()
     begin
     end;
 }
END-DIFF`;

        const result = CodeExtractor.extract(response, "diff");
        
        assertEquals(result.language, "diff");
        assertEquals(result.extractedFromDelimiters, true);
        assertEquals(result.confidence, 0.95);
        assert(result.code.includes("--- a/file.al"));
        assert(result.code.includes("+++ b/file.al"));
        assert(!result.code.includes("BEGIN-DIFF"));
      });

      it("should extract diff from markdown code blocks", () => {
        const response = `
\`\`\`diff
--- a/test.al
+++ b/test.al
@@ -10,7 +10,7 @@
     var
-        OldVar: Integer;
+        NewVar: Decimal;
\`\`\``;

        const result = CodeExtractor.extract(response, "diff");
        
        assertEquals(result.language, "diff");
        assertEquals(result.confidence, 0.9);
        assert(result.code.includes("-        OldVar: Integer;"));
        assert(result.code.includes("+        NewVar: Decimal;"));
      });

      it("should detect diff patterns without delimiters", () => {
        const response = `--- a/original.al
+++ b/modified.al
@@ -1,3 +1,4 @@
+// New comment
 codeunit 50100 "Test"
 {
     procedure Calculate()`;

        const result = CodeExtractor.extract(response, "diff");
        
        assertEquals(result.language, "diff");
        assert(result.confidence >= 0.7);
        assert(result.code.includes("+// New comment"));
      });
    });

    describe("Language detection", () => {
      it("should detect language from code content", () => {
        const alCode = `codeunit 50100 "Test"
{
    procedure Calculate()
    var
        Amount: Decimal;
    begin
        exit(Amount);
    end;
}`;

        const diffCode = `--- a/file.al
+++ b/file.al
@@ -1,2 +1,2 @@
-old line
+new line`;

        const alResult = CodeExtractor.extract(alCode, "al");
        assertEquals(alResult.language, "al");

        const diffResult = CodeExtractor.extract(diffCode, "diff");
        assertEquals(diffResult.language, "diff");
      });

      it("should handle ambiguous code blocks", () => {
        const ambiguous = `\`\`\`
some code here
\`\`\``;

        const result = CodeExtractor.extract(ambiguous, "al");
        assert(result.extractedFromDelimiters);
        assert(result.confidence <= 0.8);
      });
    });
  });

  describe("cleanCode()", () => {
    it("should clean AL code artifacts", () => {
      const dirtyCode = `\`\`\`al
Here's the AL code for you:
codeunit 50100 "Test"
{
    procedure Test()
    begin
    end;
}
\`\`\``;

      const cleaned = CodeExtractor.cleanCode(dirtyCode, "al");
      
      assert(!cleaned.includes("```"));
      assert(!cleaned.includes("Here's the AL code"));
      assert(cleaned.startsWith("codeunit 50100"));
    });

    it("should normalize line endings", () => {
      const windowsEndings = "line1\r\nline2\r\nline3";
      const macEndings = "line1\rline2\rline3";
      
      const cleanedWindows = CodeExtractor.cleanCode(windowsEndings, "al");
      const cleanedMac = CodeExtractor.cleanCode(macEndings, "al");
      
      assertEquals(cleanedWindows, "line1\nline2\nline3");
      assertEquals(cleanedMac, "line1\nline2\nline3");
    });

    it("should add diff headers if missing", () => {
      const diffWithoutHeaders = `@@ -1,3 +1,3 @@
-old line
+new line`;

      const cleaned = CodeExtractor.cleanCode(diffWithoutHeaders, "diff");
      
      assert(cleaned.includes("--- a/file.al"));
      assert(cleaned.includes("+++ b/file.al"));
    });
  });

  describe("validateCode()", () => {
    it("should validate AL code", () => {
      const validAL = `codeunit 50100 "Test"
{
    procedure Calculate()
    begin
        Message('Valid');
    end;
}`;

      const errors = CodeExtractor.validateCode(validAL, "al");
      assertEquals(errors.length, 0);
    });

    it("should detect invalid AL code", () => {
      const invalidAL = "This is not AL code at all";
      const errors = CodeExtractor.validateCode(invalidAL, "al");
      assert(errors.length > 0);
      assert(errors.length > 0);
      assert(errors[0]?.includes("doesn't appear to contain AL structures"));
    });

    it("should detect explanatory text in code", () => {
      const codeWithText = `Here's the solution:
\`\`\`al
codeunit 50100 "Test"
{
    begin
    end;
}
\`\`\``;

      const errors = CodeExtractor.validateCode(codeWithText, "al");
      assert(errors.some(e => e.includes("explanatory text")));
    });

    it("should validate diff format", () => {
      const validDiff = `--- a/file.al
+++ b/file.al
@@ -1,2 +1,2 @@
-old
+new`;

      const errors = CodeExtractor.validateCode(validDiff, "diff");
      assertEquals(errors.length, 0);
    });

    it("should detect invalid diff", () => {
      const invalidDiff = "Just some regular text";
      const errors = CodeExtractor.validateCode(invalidDiff, "diff");
      assert(errors.length > 0);
      assert(errors.some(e => e.includes("doesn't contain any changes")));
    });

    it("should handle empty code", () => {
      const errors = CodeExtractor.validateCode("", "al");
      assert(errors.length > 0);
      assert(errors.length > 0);
      assert(errors[0]?.includes("Empty code"));
    });
  });
});