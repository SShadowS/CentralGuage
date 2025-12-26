codeunit 80014 "CG-AL-H013 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LoopUtilities: Codeunit "CG Loop Utilities";

    [Test]
    procedure TestSumPositiveNumbers_AllPositive()
    var
        Numbers: List of [Decimal];
        Result: Decimal;
    begin
        Numbers.Add(10);
        Numbers.Add(20);
        Numbers.Add(30);

        Result := LoopUtilities.SumPositiveNumbers(Numbers);

        Assert.AreEqual(60, Result, 'Sum of positive numbers should be 60');
    end;

    [Test]
    procedure TestSumPositiveNumbers_MixedValues()
    var
        Numbers: List of [Decimal];
        Result: Decimal;
    begin
        Numbers.Add(10);
        Numbers.Add(-5);
        Numbers.Add(20);
        Numbers.Add(-15);
        Numbers.Add(30);

        Result := LoopUtilities.SumPositiveNumbers(Numbers);

        Assert.AreEqual(60, Result, 'Sum should skip negative numbers');
    end;

    [Test]
    procedure TestSumPositiveNumbers_AllNegative()
    var
        Numbers: List of [Decimal];
        Result: Decimal;
    begin
        Numbers.Add(-10);
        Numbers.Add(-20);

        Result := LoopUtilities.SumPositiveNumbers(Numbers);

        Assert.AreEqual(0, Result, 'Sum of all negative numbers should be 0');
    end;

    [Test]
    procedure TestSumPositiveNumbers_EmptyList()
    var
        Numbers: List of [Decimal];
        Result: Decimal;
    begin
        Result := LoopUtilities.SumPositiveNumbers(Numbers);

        Assert.AreEqual(0, Result, 'Sum of empty list should be 0');
    end;

    [Test]
    procedure TestCountValidCodes_AllValid()
    var
        Codes: List of [Code[20]];
        Result: Integer;
    begin
        Codes.Add('CODE1');
        Codes.Add('CODE2');
        Codes.Add('CODE3');

        Result := LoopUtilities.CountValidCodes(Codes);

        Assert.AreEqual(3, Result, 'Count should be 3 for all valid codes');
    end;

    [Test]
    procedure TestCountValidCodes_SomeEmpty()
    var
        Codes: List of [Code[20]];
        Result: Integer;
    begin
        Codes.Add('CODE1');
        Codes.Add('');
        Codes.Add('CODE2');
        Codes.Add('');
        Codes.Add('CODE3');

        Result := LoopUtilities.CountValidCodes(Codes);

        Assert.AreEqual(3, Result, 'Count should skip empty codes');
    end;

    [Test]
    procedure TestCountValidCodes_AllEmpty()
    var
        Codes: List of [Code[20]];
        Result: Integer;
    begin
        Codes.Add('');
        Codes.Add('');

        Result := LoopUtilities.CountValidCodes(Codes);

        Assert.AreEqual(0, Result, 'Count should be 0 for all empty codes');
    end;

    [Test]
    procedure TestFilterAndProcess_BasicFiltering()
    var
        Values: array[10] of Integer;
        Result: Text;
    begin
        Values[1] := 5;
        Values[2] := 15;
        Values[3] := 8;
        Values[4] := 25;
        Values[5] := 10;

        Result := LoopUtilities.FilterAndProcess(Values, 10);

        Assert.IsTrue(Result.Contains('15'), 'Should contain 15');
        Assert.IsTrue(Result.Contains('25'), 'Should contain 25');
        Assert.IsFalse(Result.Contains(',5,') or Result.StartsWith('5,') or Result.EndsWith(',5') or (Result = '5'), 'Should not contain 5');
        Assert.IsFalse(Result.Contains('8'), 'Should not contain 8');
        Assert.IsFalse(Result.Contains(',10,') or Result.EndsWith(',10'), 'Should not contain 10 (at threshold)');
    end;

    [Test]
    procedure TestFilterAndProcess_AllBelowThreshold()
    var
        Values: array[10] of Integer;
        Result: Text;
    begin
        Values[1] := 1;
        Values[2] := 2;
        Values[3] := 3;

        Result := LoopUtilities.FilterAndProcess(Values, 10);

        Assert.AreEqual('', Result, 'Result should be empty when all below threshold');
    end;
}
