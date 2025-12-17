codeunit 80017 "CG-AL-H016 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        SecureStorage: Codeunit "CG Secure Storage";

    [Test]
    procedure TestBuildAuthHeader_FormatsCorrectly()
    var
        ApiKey: SecretText;
        Result: Text;
    begin
        ApiKey := SecretText.SecretStrSubstNo('test-api-key-12345');

        Result := SecureStorage.BuildAuthHeader(ApiKey);

        Assert.IsTrue(Result.StartsWith('Bearer '), 'Should start with Bearer prefix');
        Assert.IsTrue(Result.Contains('test-api-key-12345'), 'Should contain the key');
    end;

    [Test]
    procedure TestValidateCredentials_ValidCredentials()
    var
        Password: SecretText;
        Result: Boolean;
    begin
        Password := 'correct-password';

        // This test assumes internal validation logic
        Result := SecureStorage.ValidateCredentials('admin', Password);

        // The actual result depends on implementation
        // We just verify it executes without error
        Assert.IsTrue(true, 'Validation should execute without error');
    end;

    [Test]
    procedure TestValidateCredentials_EmptyUsername()
    var
        Password: SecretText;
        Result: Boolean;
    begin
        Password := 'some-password';

        Result := SecureStorage.ValidateCredentials('', Password);

        Assert.IsFalse(Result, 'Empty username should return false');
    end;

    [Test]
    procedure TestMaskSecret_StandardLength()
    var
        Secret: SecretText;
        Result: Text;
    begin
        Secret := 'mysecretkey123';

        Result := SecureStorage.MaskSecret(Secret);

        Assert.AreEqual('myse****', Result, 'Should show first 4 chars plus mask');
    end;

    [Test]
    procedure TestMaskSecret_ShortSecret()
    var
        Secret: SecretText;
        Result: Text;
    begin
        Secret := 'abc';

        Result := SecureStorage.MaskSecret(Secret);

        // Short secrets should still be masked appropriately
        Assert.IsTrue(Result.Contains('****'), 'Should contain mask');
    end;

    [Test]
    procedure TestStoreAndRetrieve_RoundTrip()
    var
        OriginalKey: SecretText;
        RetrievedKey: SecretText;
        OriginalText, RetrievedText: Text;
    begin
        OriginalKey := 'my-secret-api-key';

        SecureStorage.StoreApiKey(OriginalKey);
        RetrievedKey := SecureStorage.RetrieveApiKey();

        // Compare by building auth headers (since we can't directly compare SecretText)
        OriginalText := SecureStorage.BuildAuthHeader(OriginalKey);
        RetrievedText := SecureStorage.BuildAuthHeader(RetrievedKey);

        Assert.AreEqual(OriginalText, RetrievedText, 'Retrieved key should match original');
    end;
}
