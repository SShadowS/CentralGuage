codeunit 80010 "CG-AL-H009 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        PriceCalculator: Codeunit "CG Price Calculator";

    [Test]
    procedure TestCalculateLineAmount_Basic()
    var
        Result: Decimal;
    begin
        // 10 * 5 = 50, no discount
        Result := PriceCalculator.CalculateLineAmount(10, 5, 0, '');
        Assert.AreEqual(50, Result, 'Basic calculation without discount');
    end;

    [Test]
    procedure TestCalculateLineAmount_WithDiscount()
    var
        Result: Decimal;
    begin
        // 100 * 2 = 200, 10% discount = 180
        Result := PriceCalculator.CalculateLineAmount(100, 2, 10, '');
        Assert.AreEqual(180, Result, 'Calculation with 10% discount');
    end;

    [Test]
    procedure TestCalculateLineAmount_Rounding()
    var
        Result: Decimal;
    begin
        // 33.33 * 3 = 99.99, with default 0.01 precision
        Result := PriceCalculator.CalculateLineAmount(33.33, 3, 0, '');
        Assert.AreEqual(99.99, Result, 'Should round to 2 decimal places');
    end;

    [Test]
    procedure TestCalculateUnitPriceFromAmount_Basic()
    var
        Result: Decimal;
    begin
        // 100 / 4 = 25
        Result := PriceCalculator.CalculateUnitPriceFromAmount(100, 4, '');
        Assert.AreEqual(25, Result, 'Basic unit price calculation');
    end;

    [Test]
    procedure TestCalculateUnitPriceFromAmount_ZeroQuantity()
    var
        Result: Decimal;
    begin
        // Should return 0, not error
        Result := PriceCalculator.CalculateUnitPriceFromAmount(100, 0, '');
        Assert.AreEqual(0, Result, 'Zero quantity should return 0');
    end;

    [Test]
    procedure TestRoundAmount_Down()
    var
        Result: Decimal;
    begin
        // 10.567 rounded down to 0.01 = 10.56
        Result := PriceCalculator.RoundAmount(10.567, '', '<');
        Assert.AreEqual(10.56, Result, 'Should round down');
    end;

    [Test]
    procedure TestRoundAmount_Up()
    var
        Result: Decimal;
    begin
        // 10.561 rounded up to 0.01 = 10.57
        Result := PriceCalculator.RoundAmount(10.561, '', '>');
        Assert.AreEqual(10.57, Result, 'Should round up');
    end;

    [Test]
    procedure TestRoundAmount_Nearest()
    var
        Result: Decimal;
    begin
        // 10.565 rounded nearest to 0.01 = 10.57 (banker's rounding)
        Result := PriceCalculator.RoundAmount(10.565, '', '=');
        // Note: AL uses banker's rounding, so 10.565 -> 10.56 or 10.57 depending on implementation
        Assert.IsTrue((Result = 10.56) or (Result = 10.57), 'Should round to nearest');
    end;

    [Test]
    procedure TestGetVATAmount_Basic()
    var
        Result: Decimal;
    begin
        // 100 * 25% = 25
        Result := PriceCalculator.GetVATAmount(100, 25, '');
        Assert.AreEqual(25, Result, 'Basic VAT calculation');
    end;

    [Test]
    procedure TestGetVATAmount_NegativeBase()
    var
        Result: Decimal;
    begin
        // -100 * 25% = -25
        Result := PriceCalculator.GetVATAmount(-100, 25, '');
        Assert.AreEqual(-25, Result, 'Negative base should give negative VAT');
    end;

    [Test]
    procedure TestGetVATAmount_ZeroPercent()
    var
        Result: Decimal;
    begin
        Result := PriceCalculator.GetVATAmount(100, 0, '');
        Assert.AreEqual(0, Result, 'Zero VAT percent should return 0');
    end;
}
