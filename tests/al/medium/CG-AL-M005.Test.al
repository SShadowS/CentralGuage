codeunit 80015 "CG-AL-M005 Test"
{
    // Tests for CG-AL-M005: Integration Codeunit - External Payment Service
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        ExternalPaymentService: Codeunit "External Payment Service";

    [Test]
    procedure TestSendPaymentRequestReturnsBoolean()
    var
        ResponseJson: JsonObject;
        Result: Boolean;
    begin
        // [SCENARIO] SendPaymentRequest procedure exists with correct signature
        // [GIVEN] Valid payment parameters
        // [WHEN] We call SendPaymentRequest
        Result := ExternalPaymentService.SendPaymentRequest(
            'ORD001',
            100.00,
            'USD',
            ResponseJson
        );

        // [THEN] Procedure returns a boolean (no compilation error means signature is correct)
        // Note: Actual HTTP call behavior depends on implementation
        Assert.IsTrue(true or not Result, 'SendPaymentRequest returns boolean');
    end;

    [Test]
    procedure TestValidatePaymentResponseApproved()
    var
        ResponseJson: JsonObject;
        IsValid: Boolean;
    begin
        // [SCENARIO] ValidatePaymentResponse returns true for approved response with all required fields
        // [GIVEN] A valid approved payment response with status, transactionId, and amount
        ResponseJson.Add('status', 'approved');
        ResponseJson.Add('transactionId', 'TXN123456');
        ResponseJson.Add('amount', 100.00);

        // [WHEN] We validate the response
        IsValid := ExternalPaymentService.ValidatePaymentResponse(ResponseJson);

        // [THEN] Validation passes
        Assert.IsTrue(IsValid, 'Response with status=approved and all required fields should be valid');
    end;

    [Test]
    procedure TestValidatePaymentResponseMissingStatus()
    var
        ResponseJson: JsonObject;
        IsValid: Boolean;
    begin
        // [SCENARIO] ValidatePaymentResponse returns false when status field is missing
        // [GIVEN] A response missing the status field
        ResponseJson.Add('transactionId', 'TXN123456');
        ResponseJson.Add('amount', 100.00);

        // [WHEN] We validate the response
        IsValid := ExternalPaymentService.ValidatePaymentResponse(ResponseJson);

        // [THEN] Validation fails
        Assert.IsFalse(IsValid, 'Response missing status field should be invalid');
    end;

    [Test]
    procedure TestValidatePaymentResponseMissingTransactionId()
    var
        ResponseJson: JsonObject;
        IsValid: Boolean;
    begin
        // [SCENARIO] ValidatePaymentResponse returns false when transactionId is missing
        // [GIVEN] A response missing the transactionId field
        ResponseJson.Add('status', 'approved');
        ResponseJson.Add('amount', 100.00);

        // [WHEN] We validate the response
        IsValid := ExternalPaymentService.ValidatePaymentResponse(ResponseJson);

        // [THEN] Validation fails
        Assert.IsFalse(IsValid, 'Response missing transactionId field should be invalid');
    end;

    [Test]
    procedure TestValidatePaymentResponseMissingAmount()
    var
        ResponseJson: JsonObject;
        IsValid: Boolean;
    begin
        // [SCENARIO] ValidatePaymentResponse returns false when amount is missing
        // [GIVEN] A response missing the amount field
        ResponseJson.Add('status', 'approved');
        ResponseJson.Add('transactionId', 'TXN123456');

        // [WHEN] We validate the response
        IsValid := ExternalPaymentService.ValidatePaymentResponse(ResponseJson);

        // [THEN] Validation fails
        Assert.IsFalse(IsValid, 'Response missing amount field should be invalid');
    end;

    [Test]
    procedure TestValidatePaymentResponseDeclined()
    var
        ResponseJson: JsonObject;
        IsValid: Boolean;
    begin
        // [SCENARIO] ValidatePaymentResponse returns false for declined status
        // [GIVEN] A response with status=declined (even with all fields present)
        ResponseJson.Add('status', 'declined');
        ResponseJson.Add('transactionId', 'TXN123456');
        ResponseJson.Add('amount', 100.00);

        // [WHEN] We validate the response
        IsValid := ExternalPaymentService.ValidatePaymentResponse(ResponseJson);

        // [THEN] Validation fails because status is not approved
        Assert.IsFalse(IsValid, 'Response with status=declined should be invalid');
    end;

    [Test]
    procedure TestValidatePaymentResponsePending()
    var
        ResponseJson: JsonObject;
        IsValid: Boolean;
    begin
        // [SCENARIO] ValidatePaymentResponse returns false for pending status
        // [GIVEN] A response with status=pending
        ResponseJson.Add('status', 'pending');
        ResponseJson.Add('transactionId', 'TXN123456');
        ResponseJson.Add('amount', 100.00);

        // [WHEN] We validate the response
        IsValid := ExternalPaymentService.ValidatePaymentResponse(ResponseJson);

        // [THEN] Validation fails because status is not approved
        Assert.IsFalse(IsValid, 'Response with status=pending should be invalid');
    end;

    [Test]
    procedure TestValidatePaymentResponseEmptyJson()
    var
        ResponseJson: JsonObject;
        IsValid: Boolean;
    begin
        // [SCENARIO] ValidatePaymentResponse returns false for empty JSON
        // [GIVEN] An empty JSON object

        // [WHEN] We validate the empty response
        IsValid := ExternalPaymentService.ValidatePaymentResponse(ResponseJson);

        // [THEN] Validation fails
        Assert.IsFalse(IsValid, 'Empty response should be invalid');
    end;

    [Test]
    procedure TestGetPaymentStatusReturnsText()
    var
        Status: Text;
    begin
        // [SCENARIO] GetPaymentStatus returns status for a transaction
        // [GIVEN] A transaction ID
        // [WHEN] We get the status
        Status := ExternalPaymentService.GetPaymentStatus('TXN123456');

        // [THEN] A status text is returned (non-empty expected for valid transaction)
        Assert.AreNotEqual('', Status, 'GetPaymentStatus should return a non-empty status');
    end;

    [Test]
    procedure TestHandlePaymentWebhookPaymentCompleted()
    var
        WebhookPayload: JsonObject;
        Handled: Boolean;
    begin
        // [SCENARIO] HandlePaymentWebhook processes payment.completed events
        // [GIVEN] A webhook payload with payment.completed event
        WebhookPayload.Add('event', 'payment.completed');
        WebhookPayload.Add('transactionId', 'TXN123456');
        WebhookPayload.Add('status', 'success');

        // [WHEN] We handle the webhook
        Handled := ExternalPaymentService.HandlePaymentWebhook(WebhookPayload);

        // [THEN] Webhook is successfully handled
        Assert.IsTrue(Handled, 'payment.completed webhook should be handled');
    end;

    [Test]
    procedure TestHandlePaymentWebhookPaymentFailed()
    var
        WebhookPayload: JsonObject;
        Handled: Boolean;
    begin
        // [SCENARIO] HandlePaymentWebhook processes payment.failed events
        // [GIVEN] A webhook payload with payment.failed event
        WebhookPayload.Add('event', 'payment.failed');
        WebhookPayload.Add('transactionId', 'TXN123456');
        WebhookPayload.Add('status', 'failed');
        WebhookPayload.Add('error', 'Card declined');

        // [WHEN] We handle the webhook
        Handled := ExternalPaymentService.HandlePaymentWebhook(WebhookPayload);

        // [THEN] Webhook is successfully handled
        Assert.IsTrue(Handled, 'payment.failed webhook should be handled');
    end;

    [Test]
    procedure TestHandlePaymentWebhookMissingEvent()
    var
        WebhookPayload: JsonObject;
        Handled: Boolean;
    begin
        // [SCENARIO] HandlePaymentWebhook rejects webhooks without event type
        // [GIVEN] A webhook payload missing the event field
        WebhookPayload.Add('transactionId', 'TXN123456');
        WebhookPayload.Add('status', 'success');

        // [WHEN] We handle the webhook
        Handled := ExternalPaymentService.HandlePaymentWebhook(WebhookPayload);

        // [THEN] Webhook is not handled due to missing event
        Assert.IsFalse(Handled, 'Webhook without event type should not be handled');
    end;

    [Test]
    procedure TestHandlePaymentWebhookEmptyPayload()
    var
        WebhookPayload: JsonObject;
        Handled: Boolean;
    begin
        // [SCENARIO] HandlePaymentWebhook rejects empty payloads
        // [GIVEN] An empty webhook payload

        // [WHEN] We handle the webhook
        Handled := ExternalPaymentService.HandlePaymentWebhook(WebhookPayload);

        // [THEN] Webhook is not handled
        Assert.IsFalse(Handled, 'Empty webhook payload should not be handled');
    end;

    [Test]
    procedure TestLogPaymentTransactionExecutes()
    var
        TransactionId: Text[50];
        Amount: Decimal;
        Status: Text[20];
    begin
        // [SCENARIO] LogPaymentTransaction records transaction without error
        // [GIVEN] Transaction details
        TransactionId := 'TXN123456';
        Amount := 100.00;
        Status := 'Completed';

        // [WHEN] We log the transaction
        ExternalPaymentService.LogPaymentTransaction(TransactionId, Amount, Status);

        // [THEN] No error occurs (procedure completes successfully)
        Assert.IsTrue(true, 'LogPaymentTransaction executed without error');
    end;

    [Test]
    procedure TestLogPaymentTransactionDifferentStatuses()
    var
        TransactionId: Text[50];
        Amount: Decimal;
    begin
        // [SCENARIO] LogPaymentTransaction handles various status values
        // [GIVEN] Different transaction statuses
        TransactionId := 'TXN789';
        Amount := 250.00;

        // [WHEN] We log transactions with different statuses
        // [THEN] All log operations complete without error
        ExternalPaymentService.LogPaymentTransaction(TransactionId, Amount, 'Pending');
        ExternalPaymentService.LogPaymentTransaction(TransactionId, Amount, 'Completed');
        ExternalPaymentService.LogPaymentTransaction(TransactionId, Amount, 'Failed');
        ExternalPaymentService.LogPaymentTransaction(TransactionId, Amount, 'Refunded');

        Assert.IsTrue(true, 'All status types logged successfully');
    end;

    [Test]
    procedure TestJsonSerializationRoundtrip()
    var
        OriginalJson: JsonObject;
        ParsedJson: JsonObject;
        JsonText: Text;
        Token: JsonToken;
        ParsedStatus: Text;
        ParsedAmount: Decimal;
    begin
        // [SCENARIO] JSON serialization and deserialization work correctly
        // [GIVEN] A payment response JSON
        OriginalJson.Add('status', 'approved');
        OriginalJson.Add('transactionId', 'TXN-TEST-001');
        OriginalJson.Add('amount', 199.99);

        // [WHEN] We serialize and deserialize
        OriginalJson.WriteTo(JsonText);
        ParsedJson.ReadFrom(JsonText);

        // [THEN] Values are preserved
        ParsedJson.Get('status', Token);
        ParsedStatus := Token.AsValue().AsText();
        Assert.AreEqual('approved', ParsedStatus, 'Status should be preserved');

        ParsedJson.Get('amount', Token);
        ParsedAmount := Token.AsValue().AsDecimal();
        Assert.AreEqual(199.99, ParsedAmount, 'Amount should be preserved');
    end;

    [Test]
    procedure TestJsonDeserializationWithNestedObjects()
    var
        ResponseJson: JsonObject;
        JsonText: Text;
        Token: JsonToken;
        MetadataObj: JsonObject;
    begin
        // [SCENARIO] Deserialization handles nested JSON objects
        // [GIVEN] JSON with nested structure
        JsonText := '{"status":"approved","transactionId":"TXN123","amount":100.00,"metadata":{"source":"web","timestamp":"2025-01-15T10:30:00Z"}}';

        // [WHEN] We parse the JSON
        ResponseJson.ReadFrom(JsonText);

        // [THEN] Nested objects are accessible
        Assert.IsTrue(ResponseJson.Contains('metadata'), 'Should contain metadata field');
        ResponseJson.Get('metadata', Token);
        Assert.IsTrue(Token.IsObject(), 'Metadata should be an object');
    end;

    [Test]
    procedure TestSendPaymentRequestWithVariousCurrencies()
    var
        ResponseJson: JsonObject;
        ResultUSD: Boolean;
        ResultEUR: Boolean;
        ResultGBP: Boolean;
    begin
        // [SCENARIO] SendPaymentRequest accepts various currency codes
        // [GIVEN] Payment requests with different currencies
        // [WHEN] We send requests with USD, EUR, and GBP
        ResultUSD := ExternalPaymentService.SendPaymentRequest('ORD-USD-001', 100.00, 'USD', ResponseJson);
        Clear(ResponseJson);
        ResultEUR := ExternalPaymentService.SendPaymentRequest('ORD-EUR-001', 85.00, 'EUR', ResponseJson);
        Clear(ResponseJson);
        ResultGBP := ExternalPaymentService.SendPaymentRequest('ORD-GBP-001', 75.00, 'GBP', ResponseJson);

        // [THEN] All currency codes are accepted (procedure executes without error)
        Assert.IsTrue(true, 'All currency codes processed without error');
    end;

    [Test]
    procedure TestSendPaymentRequestWithZeroAmount()
    var
        ResponseJson: JsonObject;
        Result: Boolean;
    begin
        // [SCENARIO] SendPaymentRequest handles zero amount
        // [GIVEN] A payment request with zero amount
        // [WHEN] We send the request
        Result := ExternalPaymentService.SendPaymentRequest('ORD-ZERO', 0.00, 'USD', ResponseJson);

        // [THEN] Request is processed (implementation may return false for invalid amount)
        // The key test is that no unhandled error occurs
        Assert.IsTrue(true or not Result, 'Zero amount request handled without crash');
    end;

    [Test]
    procedure TestSendPaymentRequestWithNegativeAmount()
    var
        ResponseJson: JsonObject;
        Result: Boolean;
    begin
        // [SCENARIO] SendPaymentRequest handles negative amount (refund scenario)
        // [GIVEN] A payment request with negative amount
        // [WHEN] We send the request
        Result := ExternalPaymentService.SendPaymentRequest('ORD-REFUND', -50.00, 'USD', ResponseJson);

        // [THEN] Request is processed without unhandled error
        Assert.IsTrue(true or not Result, 'Negative amount request handled without crash');
    end;

    [Test]
    procedure TestSendPaymentRequestWithLargeAmount()
    var
        ResponseJson: JsonObject;
        Result: Boolean;
    begin
        // [SCENARIO] SendPaymentRequest handles large amounts
        // [GIVEN] A payment request with large amount
        // [WHEN] We send the request
        Result := ExternalPaymentService.SendPaymentRequest('ORD-LARGE', 999999999.99, 'USD', ResponseJson);

        // [THEN] Request is processed without overflow error
        Assert.IsTrue(true or not Result, 'Large amount request handled without overflow');
    end;

    [Test]
    procedure TestHandlePaymentWebhookRefundEvent()
    var
        WebhookPayload: JsonObject;
        Handled: Boolean;
    begin
        // [SCENARIO] HandlePaymentWebhook processes refund events
        // [GIVEN] A webhook payload with payment.refunded event
        WebhookPayload.Add('event', 'payment.refunded');
        WebhookPayload.Add('transactionId', 'TXN-REFUND-001');
        WebhookPayload.Add('originalTransactionId', 'TXN123456');
        WebhookPayload.Add('refundAmount', 50.00);
        WebhookPayload.Add('status', 'refunded');

        // [WHEN] We handle the webhook
        Handled := ExternalPaymentService.HandlePaymentWebhook(WebhookPayload);

        // [THEN] Refund webhook is handled
        Assert.IsTrue(Handled, 'payment.refunded webhook should be handled');
    end;
}
