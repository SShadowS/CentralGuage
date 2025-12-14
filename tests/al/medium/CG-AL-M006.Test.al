codeunit 80016 "CG-AL-M006 Test"
{
    // Tests for CG-AL-M006: Advanced Extension - Advanced Customer Extension
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibrarySales: Codeunit "Library - Sales";

    [Test]
    procedure TestCreditScoreField()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Credit Score field exists and validates range
        // [GIVEN] A customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We set a valid credit score
        Customer."Credit Score" := 750;
        Customer.Modify();

        // [THEN] Value is stored
        Customer.Get(Customer."No.");
        Assert.AreEqual(750, Customer."Credit Score", 'Credit Score should be stored');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestCreditScoreMinimumValidation()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Credit Score below 300 is rejected
        // [GIVEN] A customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We set credit score below minimum
        // [THEN] Error is raised
        asserterror Customer.Validate("Credit Score", 200);
        Assert.ExpectedError('Credit Score must be between 300 and 850');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestCreditScoreMaximumValidation()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Credit Score above 850 is rejected
        // [GIVEN] A customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We set credit score above maximum
        // [THEN] Error is raised
        asserterror Customer.Validate("Credit Score", 900);
        Assert.ExpectedError('Credit Score must be between 300 and 850');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestRiskLevelCalculation()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Risk Level is calculated from Credit Score
        // [GIVEN] A customer with credit score
        LibrarySales.CreateCustomer(Customer);
        Customer."Credit Score" := 750;
        Customer.Modify();

        // [WHEN] We update risk level
        Customer.UpdateRiskLevel();

        // [THEN] Risk level is set appropriately
        Assert.AreEqual(Customer."Risk Level"::Low, Customer."Risk Level",
            'High credit score should result in Low risk');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestRiskLevelHighRisk()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Low credit score results in high risk
        // [GIVEN] A customer with low credit score
        LibrarySales.CreateCustomer(Customer);
        Customer."Credit Score" := 350;
        Customer.Modify();

        // [WHEN] We update risk level
        Customer.UpdateRiskLevel();

        // [THEN] Risk level is High
        Assert.AreEqual(Customer."Risk Level"::High, Customer."Risk Level",
            'Low credit score should result in High risk');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestPaymentHistoryRatingCalculation()
    var
        Customer: Record Customer;
        Rating: Decimal;
    begin
        // [SCENARIO] Payment History Rating is calculated
        // [GIVEN] A customer with payment history
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We calculate payment history rating
        Rating := Customer.CalculatePaymentHistoryRating();

        // [THEN] Rating is returned (0-100 scale)
        Assert.IsTrue(Rating >= 0, 'Rating should be non-negative');
        Assert.IsTrue(Rating <= 100, 'Rating should not exceed 100');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestGetCreditLimit()
    var
        Customer: Record Customer;
        CreditLimit: Decimal;
    begin
        // [SCENARIO] Credit limit is calculated based on risk
        // [GIVEN] A customer with risk level
        LibrarySales.CreateCustomer(Customer);
        Customer."Credit Score" := 700;
        Customer.UpdateRiskLevel();
        Customer.Modify();

        // [WHEN] We get credit limit
        CreditLimit := Customer.GetCreditLimit();

        // [THEN] Credit limit is positive
        Assert.IsTrue(CreditLimit > 0, 'Credit limit should be positive');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestValidateNewOrderApproved()
    var
        Customer: Record Customer;
        IsValid: Boolean;
    begin
        // [SCENARIO] Order validation passes for good customer
        // [GIVEN] A low-risk customer
        LibrarySales.CreateCustomer(Customer);
        Customer."Credit Score" := 800;
        Customer.UpdateRiskLevel();
        Customer.Modify();

        // [WHEN] We validate a new order
        IsValid := Customer.ValidateNewOrder(1000);

        // [THEN] Order is approved
        Assert.IsTrue(IsValid, 'Order should be approved for low-risk customer');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestValidateNewOrderRejected()
    var
        Customer: Record Customer;
        IsValid: Boolean;
    begin
        // [SCENARIO] Order validation fails for high-risk customer with large order
        // [GIVEN] A high-risk customer
        LibrarySales.CreateCustomer(Customer);
        Customer."Credit Score" := 350;
        Customer.UpdateRiskLevel();
        Customer.Modify();

        // [WHEN] We validate a large order
        IsValid := Customer.ValidateNewOrder(100000);

        // [THEN] Order is rejected
        Assert.IsFalse(IsValid, 'Large order should be rejected for high-risk customer');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestTriggerRiskAssessment()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Risk assessment can be triggered
        // [GIVEN] A customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We trigger risk assessment
        Customer.TriggerRiskAssessment();

        // [THEN] Assessment completes without error
        Assert.IsTrue(true, 'Risk assessment completed');

        // Cleanup
        Customer.Delete();
    end;
}
