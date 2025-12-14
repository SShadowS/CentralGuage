codeunit 80012 "CG-AL-M002 Test"
{
    // Tests for CG-AL-M002: Business Logic - Sales Order Calculator
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        SalesOrderCalculator: Codeunit "Sales Order Calculator";

    [Test]
    procedure TestCalculateLineTotalSimple()
    var
        Result: Decimal;
    begin
        // [SCENARIO] CalculateLineTotal computes quantity * unit price
        // [GIVEN] Quantity and unit price
        // [WHEN] We call CalculateLineTotal
        Result := SalesOrderCalculator.CalculateLineTotal(10, 25.00);
        // [THEN] Result is correct
        Assert.AreEqual(250.00, Result, 'Line total should be 250');
    end;

    [Test]
    procedure TestCalculateLineTotalWithDiscount()
    var
        Result: Decimal;
    begin
        // [SCENARIO] CalculateLineTotal with discount percentage
        // [GIVEN] Quantity, unit price, and discount
        // [WHEN] We call CalculateLineTotal with discount
        Result := SalesOrderCalculator.CalculateLineTotal(10, 100.00, 10); // 10% discount
        // [THEN] Result reflects discount
        Assert.AreEqual(900.00, Result, 'Line total should be 900 after 10% discount');
    end;

    [Test]
    procedure TestCalculateOrderTotalMultipleLines()
    var
        LineTotals: List of [Decimal];
        Result: Decimal;
    begin
        // [SCENARIO] CalculateOrderTotal sums multiple line totals
        // [GIVEN] Multiple line totals
        LineTotals.Add(100.00);
        LineTotals.Add(200.00);
        LineTotals.Add(150.00);

        // [WHEN] We call CalculateOrderTotal
        Result := SalesOrderCalculator.CalculateOrderTotal(LineTotals);

        // [THEN] Result is sum of all lines
        Assert.AreEqual(450.00, Result, 'Order total should be 450');
    end;

    [Test]
    procedure TestApplyVolumeDiscountTier1()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Volume discount tier 1 (small orders)
        // [GIVEN] Order total below first threshold
        // [WHEN] We apply volume discount
        Result := SalesOrderCalculator.ApplyVolumeDiscount(500.00);
        // [THEN] No discount applied
        Assert.AreEqual(500.00, Result, 'No discount for small orders');
    end;

    [Test]
    procedure TestApplyVolumeDiscountTier2()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Volume discount tier 2 (medium orders)
        // [GIVEN] Order total in tier 2 range (e.g., 1000-5000)
        // [WHEN] We apply volume discount
        Result := SalesOrderCalculator.ApplyVolumeDiscount(2000.00);
        // [THEN] Tier 2 discount applied (e.g., 5%)
        Assert.AreEqual(1900.00, Result, 'Tier 2 discount should be applied');
    end;

    [Test]
    procedure TestApplyVolumeDiscountTier3()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Volume discount tier 3 (large orders)
        // [GIVEN] Order total above highest threshold
        // [WHEN] We apply volume discount
        Result := SalesOrderCalculator.ApplyVolumeDiscount(10000.00);
        // [THEN] Maximum discount applied (e.g., 10%)
        Assert.AreEqual(9000.00, Result, 'Tier 3 discount should be applied');
    end;

    [Test]
    procedure TestValidateOrderLimitsMinimum()
    var
        IsValid: Boolean;
    begin
        // [SCENARIO] Order must meet minimum value
        // [GIVEN] Order below minimum
        // [WHEN] We validate order limits
        IsValid := SalesOrderCalculator.ValidateOrderLimits(5.00);
        // [THEN] Validation fails
        Assert.IsFalse(IsValid, 'Orders below minimum should fail validation');
    end;

    [Test]
    procedure TestValidateOrderLimitsMaximum()
    var
        IsValid: Boolean;
    begin
        // [SCENARIO] Order must not exceed maximum value
        // [GIVEN] Order above maximum
        // [WHEN] We validate order limits
        IsValid := SalesOrderCalculator.ValidateOrderLimits(1000000.00);
        // [THEN] Validation fails
        Assert.IsFalse(IsValid, 'Orders above maximum should fail validation');
    end;

    [Test]
    procedure TestValidateOrderLimitsValid()
    var
        IsValid: Boolean;
    begin
        // [SCENARIO] Valid order passes validation
        // [GIVEN] Order within limits
        // [WHEN] We validate order limits
        IsValid := SalesOrderCalculator.ValidateOrderLimits(1000.00);
        // [THEN] Validation passes
        Assert.IsTrue(IsValid, 'Valid order should pass validation');
    end;

    [Test]
    procedure TestCalculateTaxAmount()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Tax is calculated correctly
        // [GIVEN] Taxable amount and tax rate
        // [WHEN] We calculate tax
        Result := SalesOrderCalculator.CalculateTaxAmount(1000.00, 8.5); // 8.5% tax
        // [THEN] Tax amount is correct
        Assert.AreEqual(85.00, Result, 'Tax should be 85');
    end;

    [Test]
    procedure TestCalculateTaxAmountZeroRate()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Zero tax rate returns zero
        // [GIVEN] Zero tax rate
        // [WHEN] We calculate tax
        Result := SalesOrderCalculator.CalculateTaxAmount(1000.00, 0);
        // [THEN] No tax
        Assert.AreEqual(0, Result, 'Zero rate should return zero tax');
    end;

    [Test]
    procedure TestErrorHandlingNegativeQuantity()
    begin
        // [SCENARIO] Negative quantity raises error
        // [GIVEN] Negative quantity
        // [WHEN] We call CalculateLineTotal
        // [THEN] Error is raised
        asserterror SalesOrderCalculator.CalculateLineTotal(-5, 100.00);
        Assert.ExpectedError('Quantity must be positive');
    end;

    [Test]
    procedure TestErrorHandlingNegativePrice()
    begin
        // [SCENARIO] Negative price raises error
        // [GIVEN] Negative unit price
        // [WHEN] We call CalculateLineTotal
        // [THEN] Error is raised
        asserterror SalesOrderCalculator.CalculateLineTotal(10, -50.00);
        Assert.ExpectedError('Price must be positive');
    end;
}
