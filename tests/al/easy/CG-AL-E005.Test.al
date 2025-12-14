codeunit 80005 "CG-AL-E005 Test"
{
    // Tests for CG-AL-E005: Simple Codeunit - Text Utilities
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        TextUtilities: Codeunit "Text Utilities";

    [Test]
    procedure TestCapitalizeFirstLetterSimple()
    var
        Result: Text;
    begin
        // [SCENARIO] CapitalizeFirstLetter capitalizes first letter of simple word
        // [GIVEN] A lowercase word
        // [WHEN] We call CapitalizeFirstLetter
        Result := TextUtilities.CapitalizeFirstLetter('hello');
        // [THEN] First letter is capitalized
        Assert.AreEqual('Hello', Result, 'First letter should be capitalized');
    end;

    [Test]
    procedure TestCapitalizeFirstLetterAlreadyCapitalized()
    var
        Result: Text;
    begin
        // [SCENARIO] CapitalizeFirstLetter handles already capitalized text
        // [GIVEN] An already capitalized word
        // [WHEN] We call CapitalizeFirstLetter
        Result := TextUtilities.CapitalizeFirstLetter('Hello');
        // [THEN] Result is unchanged
        Assert.AreEqual('Hello', Result, 'Already capitalized text should remain unchanged');
    end;

    [Test]
    procedure TestCapitalizeFirstLetterEmpty()
    var
        Result: Text;
    begin
        // [SCENARIO] CapitalizeFirstLetter handles empty string
        // [GIVEN] An empty string
        // [WHEN] We call CapitalizeFirstLetter
        Result := TextUtilities.CapitalizeFirstLetter('');
        // [THEN] Result is empty
        Assert.AreEqual('', Result, 'Empty string should return empty string');
    end;

    [Test]
    procedure TestCountWordsSingle()
    var
        Result: Integer;
    begin
        // [SCENARIO] CountWords counts single word
        // [GIVEN] A single word
        // [WHEN] We call CountWords
        Result := TextUtilities.CountWords('hello');
        // [THEN] Count is 1
        Assert.AreEqual(1, Result, 'Single word should return count of 1');
    end;

    [Test]
    procedure TestCountWordsMultiple()
    var
        Result: Integer;
    begin
        // [SCENARIO] CountWords counts multiple words
        // [GIVEN] Multiple words
        // [WHEN] We call CountWords
        Result := TextUtilities.CountWords('hello world how are you');
        // [THEN] Count is correct
        Assert.AreEqual(5, Result, 'Should count 5 words');
    end;

    [Test]
    procedure TestCountWordsEmpty()
    var
        Result: Integer;
    begin
        // [SCENARIO] CountWords handles empty string
        // [GIVEN] An empty string
        // [WHEN] We call CountWords
        Result := TextUtilities.CountWords('');
        // [THEN] Count is 0
        Assert.AreEqual(0, Result, 'Empty string should return count of 0');
    end;

    [Test]
    procedure TestCountWordsExtraSpaces()
    var
        Result: Integer;
    begin
        // [SCENARIO] CountWords handles extra spaces
        // [GIVEN] Text with extra spaces
        // [WHEN] We call CountWords
        Result := TextUtilities.CountWords('  hello   world  ');
        // [THEN] Count ignores extra spaces
        Assert.AreEqual(2, Result, 'Should count 2 words ignoring extra spaces');
    end;

    [Test]
    procedure TestIsValidEmailValid()
    var
        Result: Boolean;
    begin
        // [SCENARIO] IsValidEmail accepts valid emails
        // [GIVEN] A valid email
        // [WHEN] We call IsValidEmail
        Result := TextUtilities.IsValidEmail('test@example.com');
        // [THEN] Result is true
        Assert.IsTrue(Result, 'Valid email should return true');
    end;

    [Test]
    procedure TestIsValidEmailInvalidNoAt()
    var
        Result: Boolean;
    begin
        // [SCENARIO] IsValidEmail rejects email without @
        // [GIVEN] An invalid email without @
        // [WHEN] We call IsValidEmail
        Result := TextUtilities.IsValidEmail('testexample.com');
        // [THEN] Result is false
        Assert.IsFalse(Result, 'Email without @ should return false');
    end;

    [Test]
    procedure TestIsValidEmailInvalidNoDomain()
    var
        Result: Boolean;
    begin
        // [SCENARIO] IsValidEmail rejects email without domain
        // [GIVEN] An invalid email without domain
        // [WHEN] We call IsValidEmail
        Result := TextUtilities.IsValidEmail('test@');
        // [THEN] Result is false
        Assert.IsFalse(Result, 'Email without domain should return false');
    end;

    [Test]
    procedure TestIsValidEmailEmpty()
    var
        Result: Boolean;
    begin
        // [SCENARIO] IsValidEmail rejects empty string
        // [GIVEN] An empty string
        // [WHEN] We call IsValidEmail
        Result := TextUtilities.IsValidEmail('');
        // [THEN] Result is false
        Assert.IsFalse(Result, 'Empty string should return false');
    end;

    [Test]
    procedure TestIsValidEmailWithSubdomain()
    var
        Result: Boolean;
    begin
        // [SCENARIO] IsValidEmail accepts email with subdomain
        // [GIVEN] A valid email with subdomain
        // [WHEN] We call IsValidEmail
        Result := TextUtilities.IsValidEmail('test@mail.example.com');
        // [THEN] Result is true
        Assert.IsTrue(Result, 'Email with subdomain should return true');
    end;
}
