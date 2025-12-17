codeunit 80050 "CG-AL-E050 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        TextBuilder: Codeunit "CG Text Builder";

    [Test]
    procedure TestGetSqlQuery_ContainsSelect()
    var
        Result: Text;
    begin
        Result := TextBuilder.GetSqlQuery();

        Assert.IsTrue(Result.Contains('SELECT'), 'Should contain SELECT');
        Assert.IsTrue(Result.Contains('CustomerNo'), 'Should contain CustomerNo');
        Assert.IsTrue(Result.Contains('Name'), 'Should contain Name');
        Assert.IsTrue(Result.Contains('Balance'), 'Should contain Balance');
    end;

    [Test]
    procedure TestGetSqlQuery_ContainsFrom()
    var
        Result: Text;
    begin
        Result := TextBuilder.GetSqlQuery();

        Assert.IsTrue(Result.Contains('FROM'), 'Should contain FROM');
        Assert.IsTrue(Result.Contains('Customer'), 'Should contain Customer table');
    end;

    [Test]
    procedure TestGetSqlQuery_ContainsWhereAndOrder()
    var
        Result: Text;
    begin
        Result := TextBuilder.GetSqlQuery();

        Assert.IsTrue(Result.Contains('WHERE'), 'Should contain WHERE');
        Assert.IsTrue(Result.Contains('Active'), 'Should contain Active condition');
        Assert.IsTrue(Result.Contains('ORDER BY'), 'Should contain ORDER BY');
    end;

    [Test]
    procedure TestGetSqlQuery_IsMultiline()
    var
        Result: Text;
        CrLf: Text[2];
        Lf: Text[1];
    begin
        Result := TextBuilder.GetSqlQuery();
        CrLf[1] := 13;
        CrLf[2] := 10;
        Lf[1] := 10;

        // Should contain line breaks (either CRLF or LF)
        Assert.IsTrue(Result.Contains(CrLf) or Result.Contains(Lf), 'Should be multiline with line breaks');
    end;

    [Test]
    procedure TestGetJsonTemplate_ContainsType()
    var
        Result: Text;
    begin
        Result := TextBuilder.GetJsonTemplate();

        Assert.IsTrue(Result.Contains('"type"'), 'Should contain type field');
        Assert.IsTrue(Result.Contains('"invoice"'), 'Should contain invoice value');
    end;

    [Test]
    procedure TestGetJsonTemplate_ContainsVersion()
    var
        Result: Text;
    begin
        Result := TextBuilder.GetJsonTemplate();

        Assert.IsTrue(Result.Contains('"version"'), 'Should contain version field');
        Assert.IsTrue(Result.Contains('"1.0"'), 'Should contain 1.0 value');
    end;

    [Test]
    procedure TestGetJsonTemplate_ContainsData()
    var
        Result: Text;
    begin
        Result := TextBuilder.GetJsonTemplate();

        Assert.IsTrue(Result.Contains('"data"'), 'Should contain data field');
        Assert.IsTrue(Result.Contains('null'), 'Should contain null value');
    end;

    [Test]
    procedure TestGetJsonTemplate_HasBraces()
    var
        Result: Text;
    begin
        Result := TextBuilder.GetJsonTemplate();

        Assert.IsTrue(Result.Contains('{'), 'Should contain opening brace');
        Assert.IsTrue(Result.Contains('}'), 'Should contain closing brace');
    end;

    [Test]
    procedure TestGetEmailBody_ContainsGreeting()
    var
        Result: Text;
    begin
        Result := TextBuilder.GetEmailBody('John Smith');

        Assert.IsTrue(Result.Contains('Dear'), 'Should contain Dear greeting');
        Assert.IsTrue(Result.Contains('John Smith'), 'Should contain customer name');
    end;

    [Test]
    procedure TestGetEmailBody_ContainsThankYou()
    var
        Result: Text;
    begin
        Result := TextBuilder.GetEmailBody('Test Customer');

        Assert.IsTrue(Result.Contains('Thank you'), 'Should contain thank you message');
        Assert.IsTrue(Result.Contains('order'), 'Should mention order');
    end;

    [Test]
    procedure TestGetEmailBody_ContainsSignature()
    var
        Result: Text;
    begin
        Result := TextBuilder.GetEmailBody('Test Customer');

        Assert.IsTrue(Result.Contains('Best regards') or Result.Contains('Regards'), 'Should contain regards');
        Assert.IsTrue(Result.Contains('Sales Team'), 'Should contain Sales Team signature');
    end;

    [Test]
    procedure TestGetEmailBody_IsMultiline()
    var
        Result: Text;
        CrLf: Text[2];
        Lf: Text[1];
    begin
        Result := TextBuilder.GetEmailBody('Test');
        CrLf[1] := 13;
        CrLf[2] := 10;
        Lf[1] := 10;

        Assert.IsTrue(Result.Contains(CrLf) or Result.Contains(Lf), 'Email body should be multiline');
    end;

    [Test]
    procedure TestGetEmailBody_DifferentCustomers()
    var
        Result1: Text;
        Result2: Text;
    begin
        Result1 := TextBuilder.GetEmailBody('Alice');
        Result2 := TextBuilder.GetEmailBody('Bob');

        Assert.IsTrue(Result1.Contains('Alice'), 'Should contain Alice');
        Assert.IsFalse(Result1.Contains('Bob'), 'Alice email should not contain Bob');
        Assert.IsTrue(Result2.Contains('Bob'), 'Should contain Bob');
        Assert.IsFalse(Result2.Contains('Alice'), 'Bob email should not contain Alice');
    end;
}
