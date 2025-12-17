codeunit 80005 "CG-AL-H205 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        Engine: Codeunit "CG Line Amount Engine";
        Spy: Codeunit "CG Line Amount Spy";

    [Test]
    procedure TestRoundingAndEventRaised()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Correct rounding and event is raised
        Spy.Reset();

        Result := Engine.CalculateLineAmount(12.34, 2, 10, 0.01);
        Assert.AreEqual(22.21, Result, 'Expected net: 24.68 - Round(2.468,0.01)=2.47 => 22.21');
        Assert.IsTrue(Spy.WasInvoked(), 'OnAfterCalculateLineAmount must be raised');
    end;

    [Test]
    procedure TestDiscountPercentAbove100ClampedTo100()
    var
        Result: Decimal;
    begin
        // [SCENARIO] DiscountPercent > 100 treated as 100
        Spy.Reset();

        Result := Engine.CalculateLineAmount(5, 3, 150, 0.01);
        Assert.AreEqual(0, Result, '150% should be clamped to 100%, net must be 0');
        Assert.IsTrue(Spy.WasInvoked(), 'Event must be raised when no error is thrown');
    end;

    [Test]
    procedure TestZeroQuantityReturnsZeroAndEventRaised()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Quantity = 0 returns 0 without error and still raises event
        Spy.Reset();

        Result := Engine.CalculateLineAmount(10, 0, 0, 0.01);
        Assert.AreEqual(0, Result, 'Quantity 0 should return 0');
        Assert.IsTrue(Spy.WasInvoked(), 'Event must be raised when result is 0 and no error is thrown');
    end;

    [Test]
    procedure TestNegativeInputsErrorText()
    begin
        // [SCENARIO] Negative inputs blocked with exact error text
        asserterror Engine.CalculateLineAmount(-1, 1, 0, 0.01);
        Assert.AreEqual('Inputs cannot be negative', GetLastErrorText(), 'Negative input must raise correct error');
    end;

    [Test]
    procedure TestZeroRoundingPrecisionErrorText()
    begin
        // [SCENARIO] Zero rounding precision blocked with exact error text
        asserterror Engine.CalculateLineAmount(1, 1, 0, 0);
        Assert.AreEqual('Rounding precision must be greater than zero', GetLastErrorText(), 'Zero precision must raise correct error');
    end;

    [Test]
    procedure TestEventCanModifyResult()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Subscriber modifies Result via var parameter
        Spy.Reset();

        Result := Engine.CalculateLineAmount(10, 1, 0, 0.05);
        Assert.AreEqual(10.05, Result, 'Subscriber should add RoundingPrecision (0.05) when inputs match');
        Assert.IsTrue(Spy.WasInvoked(), 'Event must be raised');
    end;
}
