codeunit 80101 "CG-AL-H001 Test"
{
    // Tests for CG-AL-H001: Hard - Tax Calculator
    // Tests complex conditional logic, boundary conditions, and decimal rounding
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        TaxCalculator: Codeunit "Tax Calculator";

    // ============================================================
    // US TAX TESTS - Amount-based tiered rates
    // ============================================================

    [Test]
    procedure TestUS_BelowThreshold_NoTax()
    var
        Result: Decimal;
    begin
        // [SCENARIO] US tax for amount below $100 threshold
        // [GIVEN] Amount of $50 in US
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(50, 'US', "CG Product Type"::Standard);
        // [THEN] Tax is 0% = $0.00
        Assert.AreEqual(0, Result, 'US amount below 100 should have 0% tax');
    end;

    [Test]
    procedure TestUS_JustBelowLowerThreshold_NoTax()
    var
        Result: Decimal;
    begin
        // [SCENARIO] US tax for $99.99 (just below $100 threshold)
        // [GIVEN] Amount of $99.99 in US
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(99.99, 'US', "CG Product Type"::Standard);
        // [THEN] Tax is 0% = $0.00
        Assert.AreEqual(0, Result, 'US amount 99.99 should have 0% tax');
    end;

    [Test]
    procedure TestUS_ExactlyAtLowerThreshold_7Percent()
    var
        Result: Decimal;
    begin
        // [SCENARIO] US tax for exactly $100 (at lower threshold)
        // [GIVEN] Amount of $100 in US
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(100, 'US', "CG Product Type"::Standard);
        // [THEN] Tax is 7% = $7.00
        Assert.AreEqual(7, Result, 'US amount exactly 100 should have 7% tax');
    end;

    [Test]
    procedure TestUS_MidRange_7Percent()
    var
        Result: Decimal;
    begin
        // [SCENARIO] US tax for mid-range amount
        // [GIVEN] Amount of $500 in US
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(500, 'US', "CG Product Type"::Standard);
        // [THEN] Tax is 7% = $35.00
        Assert.AreEqual(35, Result, 'US amount 500 should have 7% tax = 35');
    end;

    [Test]
    procedure TestUS_JustBelowUpperThreshold_7Percent()
    var
        Result: Decimal;
    begin
        // [SCENARIO] US tax for $999.99 (just below $1000 threshold)
        // [GIVEN] Amount of $999.99 in US
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(999.99, 'US', "CG Product Type"::Standard);
        // [THEN] Tax is 7% = $69.9993, rounded to $70.00
        Assert.AreEqual(70, Result, 'US amount 999.99 should have 7% tax = 70.00 (rounded)');
    end;

    [Test]
    procedure TestUS_ExactlyAtUpperThreshold_8Point5Percent()
    var
        Result: Decimal;
    begin
        // [SCENARIO] US tax for exactly $1000 (at upper threshold)
        // [GIVEN] Amount of $1000 in US
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(1000, 'US', "CG Product Type"::Standard);
        // [THEN] Tax is 8.5% = $85.00
        Assert.AreEqual(85, Result, 'US amount exactly 1000 should have 8.5% tax = 85');
    end;

    [Test]
    procedure TestUS_HighValue_8Point5Percent()
    var
        Result: Decimal;
    begin
        // [SCENARIO] US tax for high-value amount
        // [GIVEN] Amount of $5000 in US
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(5000, 'US', "CG Product Type"::Standard);
        // [THEN] Tax is 8.5% = $425.00
        Assert.AreEqual(425, Result, 'US amount 5000 should have 8.5% tax = 425');
    end;

    // ============================================================
    // DE (GERMANY) TAX TESTS - ProductType-based rates
    // ============================================================

    [Test]
    procedure TestDE_Standard_19Percent()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Germany standard tax rate
        // [GIVEN] Amount of $100 in DE with Standard product type
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(100, 'DE', "CG Product Type"::Standard);
        // [THEN] Tax is 19% = $19.00
        Assert.AreEqual(19, Result, 'DE Standard should have 19% tax');
    end;

    [Test]
    procedure TestDE_Food_ReducedRate_7Percent()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Germany reduced rate for Food
        // [GIVEN] Amount of $100 in DE with Food product type
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(100, 'DE', "CG Product Type"::Food);
        // [THEN] Tax is 7% = $7.00
        Assert.AreEqual(7, Result, 'DE Food should have reduced 7% tax');
    end;

    [Test]
    procedure TestDE_RoundingTest()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Germany tax with rounding
        // [GIVEN] Amount of $333.33 in DE with Standard product type
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(333.33, 'DE', "CG Product Type"::Standard);
        // [THEN] Tax is 19% = $63.3327, rounded to $63.33
        Assert.AreEqual(63.33, Result, 'DE 333.33 at 19% should round to 63.33');
    end;

    // ============================================================
    // UK (UNITED KINGDOM) TAX TESTS - ProductType-based rates
    // ============================================================

    [Test]
    procedure TestUK_Standard_20Percent()
    var
        Result: Decimal;
    begin
        // [SCENARIO] UK standard tax rate
        // [GIVEN] Amount of $100 in UK with Standard product type
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(100, 'UK', "CG Product Type"::Standard);
        // [THEN] Tax is 20% = $20.00
        Assert.AreEqual(20, Result, 'UK Standard should have 20% tax');
    end;

    [Test]
    procedure TestUK_Books_ZeroRated()
    var
        Result: Decimal;
    begin
        // [SCENARIO] UK zero-rated Books
        // [GIVEN] Amount of $100 in UK with Books product type
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(100, 'UK', "CG Product Type"::Books);
        // [THEN] Tax is 0% = $0.00
        Assert.AreEqual(0, Result, 'UK Books should be zero-rated');
    end;

    [Test]
    procedure TestUK_NoAmountThreshold()
    var
        Result: Decimal;
    begin
        // [SCENARIO] UK has no amount threshold (unlike US)
        // [GIVEN] Small amount of $99.99 in UK with Standard product type
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(99.99, 'UK', "CG Product Type"::Standard);
        // [THEN] Tax is still 20% = $19.998, rounded to $20.00
        Assert.AreEqual(20, Result, 'UK has no threshold - small amounts still taxed at 20%');
    end;

    // ============================================================
    // EDGE CASE TESTS
    // ============================================================

    [Test]
    procedure TestNegativeAmount_US_ReturnsZero()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Negative amounts should return zero
        // [GIVEN] Negative amount of -$100 in US
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(-100, 'US', "CG Product Type"::Standard);
        // [THEN] Result is $0.00
        Assert.AreEqual(0, Result, 'Negative amounts should return 0');
    end;

    [Test]
    procedure TestNegativeAmount_DE_ReturnsZero()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Negative amounts should return zero (DE)
        // [GIVEN] Negative amount of -$50 in DE with Food
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(-50, 'DE', "CG Product Type"::Food);
        // [THEN] Result is $0.00
        Assert.AreEqual(0, Result, 'Negative amounts should return 0 regardless of country');
    end;

    [Test]
    procedure TestUnknownCountry_ReturnsZero()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Unknown country codes should return zero
        // [GIVEN] Amount of $100 in unknown country 'XX'
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(100, 'XX', "CG Product Type"::Standard);
        // [THEN] Result is $0.00
        Assert.AreEqual(0, Result, 'Unknown country should return 0');
    end;

    [Test]
    procedure TestZeroAmount_ReturnsZero()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Zero amount should return zero
        // [GIVEN] Amount of $0 in US
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(0, 'US', "CG Product Type"::Standard);
        // [THEN] Result is $0.00
        Assert.AreEqual(0, Result, 'Zero amount should return 0');
    end;

    // ============================================================
    // ROUNDING TESTS
    // ============================================================

    [Test]
    procedure TestRounding_DE_Standard()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Verify rounding to 2 decimal places
        // [GIVEN] Amount of $100.05 in DE with Standard (19%)
        // [WHEN] We calculate tax (19.0095)
        Result := TaxCalculator.CalculateTax(100.05, 'DE', "CG Product Type"::Standard);
        // [THEN] Result is rounded to $19.01
        Assert.AreEqual(19.01, Result, 'DE 100.05 at 19% should round to 19.01');
    end;

    [Test]
    procedure TestRounding_UK_Standard()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Verify exact decimal result
        // [GIVEN] Amount of $123.45 in UK with Standard (20%)
        // [WHEN] We calculate tax
        Result := TaxCalculator.CalculateTax(123.45, 'UK', "CG Product Type"::Standard);
        // [THEN] Result is exactly $24.69
        Assert.AreEqual(24.69, Result, 'UK 123.45 at 20% should be 24.69');
    end;

    [Test]
    procedure TestRounding_US_MidRange()
    var
        Result: Decimal;
    begin
        // [SCENARIO] Verify rounding in US mid-range tier
        // [GIVEN] Amount of $142.86 in US (7% tier)
        // [WHEN] We calculate tax (10.0002)
        Result := TaxCalculator.CalculateTax(142.86, 'US', "CG Product Type"::Standard);
        // [THEN] Result is rounded to $10.00
        Assert.AreEqual(10, Result, 'US 142.86 at 7% should round to 10.00');
    end;
}
