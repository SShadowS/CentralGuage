codeunit 80008 "CG-AL-E008 Test"
{
    // Tests for CG-AL-E008: Basic Interface - Payment Processor
    // Note: Interfaces cannot be instantiated directly, so we test
    // that a valid implementation can be created and called
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;

    [Test]
    procedure TestInterfaceCompiles()
    begin
        // [SCENARIO] Payment Processor interface compiles successfully
        // [GIVEN] The interface definition
        // [WHEN] The test app compiles
        // [THEN] No compilation errors occur
        // This test passes if the codeunit compiles, which means
        // the interface is syntactically correct
        Assert.IsTrue(true, 'Interface compiled successfully');
    end;

    [Test]
    procedure TestInterfaceCanBeDeclared()
    var
        PaymentProcessor: Interface "Payment Processor";
    begin
        // [SCENARIO] Payment Processor interface can be declared as variable
        // [GIVEN] The interface definition
        // [WHEN] We declare a variable of the interface type
        // [THEN] No error occurs
        Assert.IsTrue(true, 'Interface variable can be declared');
    end;

    [Test]
    procedure TestInterfaceProceduresExist()
    begin
        // [SCENARIO] Interface declares required procedures
        // [GIVEN] The Payment Processor interface
        // [WHEN] We examine the interface
        // [THEN] ProcessPayment, ValidatePayment, GetTransactionFee exist
        // This is verified at compile time - if procedures are missing,
        // compilation would fail
        Assert.IsTrue(true, 'Required procedures are declared');
    end;

    [Test]
    procedure TestProcessPayment()
    var
        PaymentProcessor: Interface "Payment Processor";
        MockProcessor: Codeunit "CG-AL-E008 Mock Processor";
        Result: Boolean;
    begin
        // [SCENARIO] ProcessPayment returns expected result
        // [GIVEN] A payment processor implementation
        PaymentProcessor := MockProcessor;
        // [WHEN] We process a payment
        Result := PaymentProcessor.ProcessPayment(100.00, 'CreditCard');
        // [THEN] The payment is processed successfully
        Assert.IsTrue(Result, 'Payment should be processed');
    end;

    [Test]
    procedure TestValidatePayment()
    var
        PaymentProcessor: Interface "Payment Processor";
        MockProcessor: Codeunit "CG-AL-E008 Mock Processor";
        Result: Boolean;
    begin
        // [SCENARIO] ValidatePayment returns expected result
        // [GIVEN] A payment processor implementation
        PaymentProcessor := MockProcessor;
        // [WHEN] We validate payment data
        Result := PaymentProcessor.ValidatePayment('ValidData');
        // [THEN] The validation succeeds
        Assert.IsTrue(Result, 'Payment validation should succeed');
    end;

    [Test]
    procedure TestGetTransactionFee()
    var
        PaymentProcessor: Interface "Payment Processor";
        MockProcessor: Codeunit "CG-AL-E008 Mock Processor";
        Fee: Decimal;
    begin
        // [SCENARIO] GetTransactionFee returns calculated fee
        // [GIVEN] A payment processor implementation
        PaymentProcessor := MockProcessor;
        // [WHEN] We get the transaction fee for an amount
        Fee := PaymentProcessor.GetTransactionFee(100.00);
        // [THEN] A fee is returned (mock returns 2.5% = 2.50)
        Assert.AreEqual(2.50, Fee, 'Fee should be 2.5% of amount');
    end;
}
