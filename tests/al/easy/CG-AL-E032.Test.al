codeunit 80032 "CG-AL-E032 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;

    [Test]
    procedure TestInterfaceCanBeUsedAndMethodsExist()
    var
        TokenProvider: Interface "CG Token Provider";
        Mock: Codeunit "CG-AL-E032 Mock Token Provider";
        Token: Text;
    begin
        // [SCENARIO] Interface supports calls to both methods
        TokenProvider := Mock;

        Token := TokenProvider.GetToken('api', false);
        Assert.AreEqual('TOKEN:api:C', Token, 'Mock token should be returned for non-refresh');

        Token := TokenProvider.GetToken('api', true);
        Assert.AreEqual('TOKEN:api:F', Token, 'Mock token should be returned for refresh');

        TokenProvider.ClearCache();
        Assert.AreEqual(1, Mock.GetClearCacheCallCount(), 'ClearCache should increment call count on the mock');

        TokenProvider.ClearCache();
        Assert.AreEqual(2, Mock.GetClearCacheCallCount(), 'ClearCache should be callable multiple times');
    end;
}
