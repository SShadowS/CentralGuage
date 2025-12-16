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
        // [GIVEN] A customer with low credit score (500-579)
        LibrarySales.CreateCustomer(Customer);
        Customer."Credit Score" := 540;
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
        AssessmentDate: Date;
    begin
        // [SCENARIO] Risk assessment updates Last Risk Assessment Date
        // [GIVEN] A customer record with credit score
        LibrarySales.CreateCustomer(Customer);
        Customer."Credit Score" := 650;
        Customer.Modify();

        // [WHEN] We trigger risk assessment
        Customer.TriggerRiskAssessment();

        // [THEN] Last Risk Assessment Date is set to today
        Customer.Get(Customer."No.");
        Assert.AreEqual(Today, Customer."Last Risk Assessment Date",
            'Last Risk Assessment Date should be set to today');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestRiskLevelMediumRisk()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Medium credit score results in medium risk
        // [GIVEN] A customer with medium credit score (580-669)
        LibrarySales.CreateCustomer(Customer);
        Customer."Credit Score" := 620;
        Customer.Modify();

        // [WHEN] We update risk level
        Customer.UpdateRiskLevel();

        // [THEN] Risk level is Medium
        Assert.AreEqual(Customer."Risk Level"::Medium, Customer."Risk Level",
            'Medium credit score should result in Medium risk');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestRiskLevelCriticalRisk()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Very low credit score results in critical risk
        // [GIVEN] A customer with very low credit score (300-499)
        LibrarySales.CreateCustomer(Customer);
        Customer."Credit Score" := 320;
        Customer.Modify();

        // [WHEN] We update risk level
        Customer.UpdateRiskLevel();

        // [THEN] Risk level is Critical
        Assert.AreEqual(Customer."Risk Level"::Critical, Customer."Risk Level",
            'Very low credit score should result in Critical risk');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestLastRiskAssessmentDateField()
    var
        Customer: Record Customer;
        TestDate: Date;
    begin
        // [SCENARIO] Last Risk Assessment Date field can be set and retrieved
        // [GIVEN] A customer record
        LibrarySales.CreateCustomer(Customer);
        TestDate := Today - 30;

        // [WHEN] We set the Last Risk Assessment Date
        Customer."Last Risk Assessment Date" := TestDate;
        Customer.Modify();

        // [THEN] Value is stored correctly
        Customer.Get(Customer."No.");
        Assert.AreEqual(TestDate, Customer."Last Risk Assessment Date",
            'Last Risk Assessment Date should be stored');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestPreferredPaymentMethodField()
    var
        Customer: Record Customer;
        PaymentMethod: Record "Payment Method";
    begin
        // [SCENARIO] Preferred Payment Method field validates against Payment Method table
        // [GIVEN] A customer record and a payment method
        LibrarySales.CreateCustomer(Customer);
        if not PaymentMethod.FindFirst() then begin
            PaymentMethod.Init();
            PaymentMethod.Code := 'TEST';
            PaymentMethod.Description := 'Test Payment';
            PaymentMethod.Insert();
        end;

        // [WHEN] We set a valid Preferred Payment Method
        Customer.Validate("Preferred Payment Method", PaymentMethod.Code);
        Customer.Modify();

        // [THEN] Value is stored correctly
        Customer.Get(Customer."No.");
        Assert.AreEqual(PaymentMethod.Code, Customer."Preferred Payment Method",
            'Preferred Payment Method should be stored');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestPreferredPaymentMethodInvalidRelation()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Invalid Preferred Payment Method is rejected
        // [GIVEN] A customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We set an invalid Preferred Payment Method
        // [THEN] Error is raised due to TableRelation
        asserterror Customer.Validate("Preferred Payment Method", 'INVALID999');
        Assert.ExpectedErrorCode('DB:RecordNotFound');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestPaymentHistoryRatingDecimalField()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Payment History Rating is a decimal field
        // [GIVEN] A customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We set the Payment History Rating
        Customer."Payment History Rating" := 85.5;
        Customer.Modify();

        // [THEN] Decimal value is stored correctly
        Customer.Get(Customer."No.");
        Assert.AreEqual(85.5, Customer."Payment History Rating",
            'Payment History Rating should store decimal values');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestCreditScoreBoundary300()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Credit Score at minimum boundary (300) is accepted
        // [GIVEN] A customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We set credit score to minimum value
        Customer.Validate("Credit Score", 300);
        Customer.Modify();

        // [THEN] Value is stored
        Customer.Get(Customer."No.");
        Assert.AreEqual(300, Customer."Credit Score", 'Credit Score 300 should be accepted');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestCreditScoreBoundary850()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Credit Score at maximum boundary (850) is accepted
        // [GIVEN] A customer record
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We set credit score to maximum value
        Customer.Validate("Credit Score", 850);
        Customer.Modify();

        // [THEN] Value is stored
        Customer.Get(Customer."No.");
        Assert.AreEqual(850, Customer."Credit Score", 'Credit Score 850 should be accepted');

        // Cleanup
        Customer.Delete();
    end;
}
