codeunit 80009 "CG-AL-H008 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        SafeExecutor: Codeunit "CG Safe Executor";

    [Test]
    procedure TestSafeDivide_ReturnsResult()
    var
        Result: Decimal;
    begin
        Result := SafeExecutor.SafeDivide(100, 4, -1);
        Assert.AreEqual(25, Result, 'SafeDivide should return correct result');
    end;

    [Test]
    procedure TestSafeDivide_ReturnsDefaultOnZeroDivisor()
    var
        Result: Decimal;
    begin
        Result := SafeExecutor.SafeDivide(100, 0, -999);
        Assert.AreEqual(-999, Result, 'SafeDivide should return default on division by zero');
    end;

    [Test]
    procedure TestSafeDivide_HandlesNegatives()
    var
        Result: Decimal;
    begin
        Result := SafeExecutor.SafeDivide(-100, 4, 0);
        Assert.AreEqual(-25, Result, 'SafeDivide should handle negative numerator');
    end;

    [Test]
    procedure TestSafeParseInteger_ValidInput()
    var
        Result: Integer;
    begin
        Result := SafeExecutor.SafeParseInteger('42', -1);
        Assert.AreEqual(42, Result, 'Should parse valid integer');
    end;

    [Test]
    procedure TestSafeParseInteger_InvalidInput()
    var
        Result: Integer;
    begin
        Result := SafeExecutor.SafeParseInteger('abc', -1);
        Assert.AreEqual(-1, Result, 'Should return default for invalid input');
    end;

    [Test]
    procedure TestSafeParseInteger_EmptyInput()
    var
        Result: Integer;
    begin
        Result := SafeExecutor.SafeParseInteger('', 0);
        Assert.AreEqual(0, Result, 'Should return default for empty input');
    end;

    [Test]
    procedure TestSafeParseInteger_NegativeNumber()
    var
        Result: Integer;
    begin
        Result := SafeExecutor.SafeParseInteger('-123', 0);
        Assert.AreEqual(-123, Result, 'Should parse negative integer');
    end;

    [Test]
    procedure TestExecuteWithFallback_PrimarySucceeds()
    var
        Result: Decimal;
    begin
        Result := SafeExecutor.ExecuteWithFallback(100, 50, 4);
        Assert.AreEqual(25, Result, 'Should return primary value divided');
    end;

    [Test]
    procedure TestExecuteWithFallback_FallbackUsed()
    var
        Result: Decimal;
    begin
        // Primary will fail (divide by zero won't happen here, let's assume a scenario)
        // Actually the logic is: try primary/divisor, if fails try fallback/divisor
        // If divisor is 0, both fail, returns 0
        Result := SafeExecutor.ExecuteWithFallback(100, 50, 0);
        Assert.AreEqual(0, Result, 'Should return 0 when both attempts fail');
    end;

    [Test]
    procedure TestExecuteWithFallback_ReturnsZeroWhenBothFail()
    var
        Result: Decimal;
    begin
        Result := SafeExecutor.ExecuteWithFallback(100, 200, 0);
        Assert.AreEqual(0, Result, 'Should return 0 when divisor is 0');
    end;
}
