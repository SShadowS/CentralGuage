codeunit 80095 "CG-AL-M005 Mock HTTP Handler"
{
    // Mock HTTP Handler for testing External Payment Service
    // Simulates various HTTP response scenarios for payment gateway integration

    var
        MockResponseStatusCode: Integer;
        MockResponseContent: Text;
        MockShouldFail: Boolean;
        MockFailureMessage: Text;
        MockCallCount: Integer;
        MockDelayMs: Integer;
        MockRetrySuccessOnAttempt: Integer;

    procedure SetSuccessResponse(StatusCode: Integer; ResponseContent: Text)
    begin
        MockResponseStatusCode := StatusCode;
        MockResponseContent := ResponseContent;
        MockShouldFail := false;
        MockFailureMessage := '';
    end;

    procedure SetFailureResponse(FailureMessage: Text)
    begin
        MockShouldFail := true;
        MockFailureMessage := FailureMessage;
        MockResponseStatusCode := 0;
        MockResponseContent := '';
    end;

    procedure SetRetryScenario(SuccessOnAttempt: Integer; SuccessStatusCode: Integer; SuccessContent: Text)
    begin
        // Fail until attempt number, then succeed
        MockRetrySuccessOnAttempt := SuccessOnAttempt;
        MockResponseStatusCode := SuccessStatusCode;
        MockResponseContent := SuccessContent;
        MockShouldFail := true;
        MockFailureMessage := 'Simulated network failure';
    end;

    procedure SetTimeoutSimulation(DelayMilliseconds: Integer)
    begin
        MockDelayMs := DelayMilliseconds;
    end;

    procedure SimulateRequest(var ResponseStatusCode: Integer; var ResponseContent: Text): Boolean
    begin
        MockCallCount += 1;

        // Handle retry scenario
        if MockRetrySuccessOnAttempt > 0 then begin
            if MockCallCount >= MockRetrySuccessOnAttempt then begin
                ResponseStatusCode := MockResponseStatusCode;
                ResponseContent := MockResponseContent;
                exit(true);
            end;
            ResponseStatusCode := 0;
            ResponseContent := MockFailureMessage;
            exit(false);
        end;

        // Handle simple failure scenario
        if MockShouldFail then begin
            ResponseStatusCode := 0;
            ResponseContent := MockFailureMessage;
            exit(false);
        end;

        // Handle success scenario
        ResponseStatusCode := MockResponseStatusCode;
        ResponseContent := MockResponseContent;
        exit(true);
    end;

    procedure GetCallCount(): Integer
    begin
        exit(MockCallCount);
    end;

    procedure Reset()
    begin
        MockResponseStatusCode := 0;
        MockResponseContent := '';
        MockShouldFail := false;
        MockFailureMessage := '';
        MockCallCount := 0;
        MockDelayMs := 0;
        MockRetrySuccessOnAttempt := 0;
    end;

    procedure CreateApprovedPaymentResponse(): Text
    begin
        exit('{"status":"approved","transactionId":"TXN-' + Format(CreateGuid()) + '","amount":100.00}');
    end;

    procedure CreateDeclinedPaymentResponse(): Text
    begin
        exit('{"status":"declined","transactionId":"","amount":0,"error":"Insufficient funds"}');
    end;

    procedure CreatePendingPaymentResponse(): Text
    begin
        exit('{"status":"pending","transactionId":"TXN-' + Format(CreateGuid()) + '","amount":100.00}');
    end;

    procedure CreateInvalidResponse(): Text
    begin
        exit('{"invalid":"response"}');
    end;

    procedure CreateMalformedJson(): Text
    begin
        exit('{invalid json content');
    end;
}
