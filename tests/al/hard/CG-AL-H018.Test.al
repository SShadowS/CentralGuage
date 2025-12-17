codeunit 80019 "CG-AL-H018 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;

    [Test]
    procedure TestFluentChaining_Basic()
    var
        Builder: Codeunit "CG Request Builder";
        Result: Text;
    begin
        Result := Builder
            .SetUrl('https://api.example.com/data')
            .SetMethod('GET')
            .Build();

        Assert.IsTrue(Result.Contains('https://api.example.com/data'), 'Should contain URL');
        Assert.IsTrue(Result.Contains('GET'), 'Should contain method');
    end;

    [Test]
    procedure TestFluentChaining_WithHeaders()
    var
        Builder: Codeunit "CG Request Builder";
        Result: Text;
    begin
        Result := Builder
            .SetUrl('https://api.example.com')
            .SetMethod('POST')
            .AddHeader('Content-Type', 'application/json')
            .AddHeader('Authorization', 'Bearer token123')
            .Build();

        Assert.IsTrue(Result.Contains('Content-Type'), 'Should contain Content-Type header');
        Assert.IsTrue(Result.Contains('Authorization'), 'Should contain Authorization header');
    end;

    [Test]
    procedure TestFluentChaining_WithBody()
    var
        Builder: Codeunit "CG Request Builder";
        Result: Text;
    begin
        Result := Builder
            .SetUrl('https://api.example.com/users')
            .SetMethod('POST')
            .SetBody('{"name":"John"}')
            .Build();

        Assert.IsTrue(Result.Contains('{"name":"John"}'), 'Should contain body');
    end;

    [Test]
    procedure TestFluentChaining_WithTimeout()
    var
        Builder: Codeunit "CG Request Builder";
        Result: Text;
    begin
        Result := Builder
            .SetUrl('https://api.example.com')
            .SetMethod('GET')
            .SetTimeout(5000)
            .Build();

        Assert.IsTrue(Result.Contains('5000'), 'Should contain timeout value');
    end;

    [Test]
    procedure TestFluentChaining_FullChain()
    var
        Builder: Codeunit "CG Request Builder";
        Result: Text;
    begin
        Result := Builder
            .SetUrl('https://api.example.com/endpoint')
            .SetMethod('PUT')
            .AddHeader('Accept', 'application/json')
            .AddHeader('X-Custom', 'value')
            .SetBody('{"data":"test"}')
            .SetTimeout(10000)
            .Build();

        Assert.IsTrue(Result.Contains('https://api.example.com/endpoint'), 'Should contain URL');
        Assert.IsTrue(Result.Contains('PUT'), 'Should contain method');
        Assert.IsTrue(Result.Contains('Accept'), 'Should contain Accept header');
        Assert.IsTrue(Result.Contains('{"data":"test"}'), 'Should contain body');
    end;

    [Test]
    procedure TestCreate_ReturnsNewInstance()
    var
        Builder: Codeunit "CG Request Builder";
        NewBuilder: Codeunit "CG Request Builder";
        Result1, Result2: Text;
    begin
        Result1 := Builder
            .SetUrl('https://first.com')
            .SetMethod('GET')
            .Build();

        NewBuilder := Builder.Create();
        Result2 := NewBuilder
            .SetUrl('https://second.com')
            .SetMethod('POST')
            .Build();

        Assert.IsTrue(Result1.Contains('first.com'), 'First builder should have first URL');
        Assert.IsTrue(Result2.Contains('second.com'), 'New builder should have second URL');
    end;
}
