codeunit 70096 "CG-AL-E008 Mock Processor" implements "Payment Processor"
{
    // Mock implementation of Payment Processor interface for testing

    procedure ProcessPayment(Amount: Decimal; PaymentMethod: Text): Boolean
    begin
        // Mock: Always return true for valid amounts
        exit(Amount > 0);
    end;

    procedure ValidatePayment(PaymentData: Text): Boolean
    begin
        // Mock: Return true if data is not empty
        exit(PaymentData <> '');
    end;

    procedure GetTransactionFee(Amount: Decimal): Decimal
    begin
        // Mock: Return 2.5% fee
        exit(Amount * 0.025);
    end;
}
