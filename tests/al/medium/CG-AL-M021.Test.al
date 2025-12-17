codeunit 80021 "CG-AL-M021 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        YamlHandler: Codeunit "CG YAML Handler";
        NL: Text[2];

    trigger OnRun()
    begin
        NL[1] := 13;
        NL[2] := 10;
    end;

    local procedure GetNewLine(): Text
    var
        Lf: Text[1];
    begin
        Lf[1] := 10;
        exit(Lf);
    end;

    [Test]
    procedure TestParseYamlConfig_BasicConfig()
    var
        YamlContent: Text;
        Result: Text;
        Lf: Text;
    begin
        Lf := GetNewLine();
        YamlContent := 'name: MyApp' + Lf +
                       'version: 1.0.0' + Lf +
                       'debug: true' + Lf +
                       'port: 8080';

        Result := YamlHandler.ParseYamlConfig(YamlContent);

        Assert.IsTrue(Result.Contains('MyApp'), 'Should contain app name');
        Assert.IsTrue(Result.Contains('1.0.0'), 'Should contain version');
        Assert.IsTrue(Result.Contains('8080'), 'Should contain port');
    end;

    [Test]
    procedure TestParseYamlConfig_DebugFalse()
    var
        YamlContent: Text;
        Result: Text;
        Lf: Text;
    begin
        Lf := GetNewLine();
        YamlContent := 'name: TestApp' + Lf +
                       'version: 2.0.0' + Lf +
                       'debug: false' + Lf +
                       'port: 3000';

        Result := YamlHandler.ParseYamlConfig(YamlContent);

        Assert.IsTrue(Result.Contains('TestApp'), 'Should contain app name');
        Assert.IsTrue(Result.Contains('2.0.0'), 'Should contain version');
        Assert.IsTrue(Result.Contains('3000'), 'Should contain port');
    end;

    [Test]
    procedure TestParseYamlConfig_FormatStructure()
    var
        YamlContent: Text;
        Result: Text;
        Lf: Text;
    begin
        Lf := GetNewLine();
        YamlContent := 'name: SampleApp' + Lf +
                       'version: 3.5.0' + Lf +
                       'debug: true' + Lf +
                       'port: 9000';

        Result := YamlHandler.ParseYamlConfig(YamlContent);

        Assert.IsTrue(Result.Contains('App'), 'Should have App label');
        Assert.IsTrue(Result.Contains('Debug'), 'Should have Debug label');
        Assert.IsTrue(Result.Contains('Port'), 'Should have Port label');
    end;

    [Test]
    procedure TestCreateYamlFromSettings_BasicSettings()
    var
        Result: Text;
    begin
        Result := YamlHandler.CreateYamlFromSettings('BCExtension', '1.0.0', 'production', true);

        Assert.IsTrue(Result.Contains('BCExtension'), 'Should contain app name');
        Assert.IsTrue(Result.Contains('1.0.0'), 'Should contain version');
        Assert.IsTrue(Result.Contains('production'), 'Should contain environment');
    end;

    [Test]
    procedure TestCreateYamlFromSettings_DevelopmentEnv()
    var
        Result: Text;
    begin
        Result := YamlHandler.CreateYamlFromSettings('DevApp', '0.1.0', 'development', false);

        Assert.IsTrue(Result.Contains('DevApp'), 'Should contain app name');
        Assert.IsTrue(Result.Contains('development'), 'Should contain environment');
    end;

    [Test]
    procedure TestCreateYamlFromSettings_IsValidYaml()
    var
        Result: Text;
    begin
        Result := YamlHandler.CreateYamlFromSettings('Test', '1.0', 'test', true);

        // YAML should have key: value format with colons
        Assert.IsTrue(Result.Contains(':'), 'Should contain YAML key-value separator');
        // Should not have JSON braces at the root level
        Assert.IsFalse(Result.StartsWith('{'), 'Should not start with JSON brace');
    end;

    [Test]
    procedure TestConvertJsonToYaml_SimpleObject()
    var
        JsonString: Text;
        Result: Text;
    begin
        JsonString := '{"name": "Product", "price": 99.99}';

        Result := YamlHandler.ConvertJsonToYaml(JsonString);

        Assert.IsTrue(Result.Contains('name'), 'Should contain name key');
        Assert.IsTrue(Result.Contains('Product'), 'Should contain Product value');
        Assert.IsTrue(Result.Contains('price'), 'Should contain price key');
        Assert.IsFalse(Result.StartsWith('{'), 'YAML should not start with brace');
    end;

    [Test]
    procedure TestConvertJsonToYaml_WithBoolean()
    var
        JsonString: Text;
        Result: Text;
    begin
        JsonString := '{"active": true, "count": 5}';

        Result := YamlHandler.ConvertJsonToYaml(JsonString);

        Assert.IsTrue(Result.Contains('active'), 'Should contain active key');
        Assert.IsTrue(Result.Contains('count'), 'Should contain count key');
    end;

    [Test]
    procedure TestConvertYamlToJson_SimpleConfig()
    var
        YamlString: Text;
        Result: Text;
        Lf: Text;
    begin
        Lf := GetNewLine();
        YamlString := 'id: 123' + Lf + 'name: Item';

        Result := YamlHandler.ConvertYamlToJson(YamlString);

        Assert.IsTrue(Result.Contains('{'), 'JSON should contain opening brace');
        Assert.IsTrue(Result.Contains('}'), 'JSON should contain closing brace');
        Assert.IsTrue(Result.Contains('"id"') or Result.Contains('"id":'), 'Should contain id key in JSON format');
        Assert.IsTrue(Result.Contains('123'), 'Should contain id value');
    end;

    [Test]
    procedure TestConvertYamlToJson_WithStringValue()
    var
        YamlString: Text;
        Result: Text;
        Lf: Text;
    begin
        Lf := GetNewLine();
        YamlString := 'status: active' + Lf + 'level: premium';

        Result := YamlHandler.ConvertYamlToJson(YamlString);

        Assert.IsTrue(Result.Contains('active'), 'Should contain status value');
        Assert.IsTrue(Result.Contains('premium'), 'Should contain level value');
        Assert.IsTrue(Result.Contains(':'), 'JSON should have colons');
    end;

    [Test]
    procedure TestMergeYamlConfigs_OverrideValue()
    var
        BaseYaml: Text;
        OverrideYaml: Text;
        Result: Text;
        Lf: Text;
    begin
        Lf := GetNewLine();
        BaseYaml := 'name: BaseApp' + Lf + 'version: 1.0.0' + Lf + 'debug: false';
        OverrideYaml := 'debug: true';

        Result := YamlHandler.MergeYamlConfigs(BaseYaml, OverrideYaml);

        Assert.IsTrue(Result.Contains('BaseApp'), 'Should keep base name');
        Assert.IsTrue(Result.Contains('1.0.0'), 'Should keep base version');
        Assert.IsTrue(Result.ToLower().Contains('true'), 'Debug should be overridden to true');
    end;

    [Test]
    procedure TestMergeYamlConfigs_AddNewKey()
    var
        BaseYaml: Text;
        OverrideYaml: Text;
        Result: Text;
        Lf: Text;
    begin
        Lf := GetNewLine();
        BaseYaml := 'name: App' + Lf + 'version: 2.0';
        OverrideYaml := 'newFeature: enabled';

        Result := YamlHandler.MergeYamlConfigs(BaseYaml, OverrideYaml);

        Assert.IsTrue(Result.Contains('name'), 'Should keep base name key');
        Assert.IsTrue(Result.Contains('version'), 'Should keep base version key');
        Assert.IsTrue(Result.Contains('newFeature'), 'Should add new key');
        Assert.IsTrue(Result.Contains('enabled'), 'Should have new value');
    end;

    [Test]
    procedure TestMergeYamlConfigs_MultipleOverrides()
    var
        BaseYaml: Text;
        OverrideYaml: Text;
        Result: Text;
        Lf: Text;
    begin
        Lf := GetNewLine();
        BaseYaml := 'a: 1' + Lf + 'b: 2' + Lf + 'c: 3';
        OverrideYaml := 'b: 20' + Lf + 'c: 30';

        Result := YamlHandler.MergeYamlConfigs(BaseYaml, OverrideYaml);

        Assert.IsTrue(Result.Contains('a'), 'Should keep key a');
        Assert.IsTrue(Result.Contains('20'), 'b should be overridden to 20');
        Assert.IsTrue(Result.Contains('30'), 'c should be overridden to 30');
    end;

    [Test]
    procedure TestMergeYamlConfigs_EmptyOverride()
    var
        BaseYaml: Text;
        OverrideYaml: Text;
        Result: Text;
        Lf: Text;
    begin
        Lf := GetNewLine();
        BaseYaml := 'key1: value1' + Lf + 'key2: value2';
        OverrideYaml := '';

        Result := YamlHandler.MergeYamlConfigs(BaseYaml, OverrideYaml);

        Assert.IsTrue(Result.Contains('key1'), 'Should keep key1');
        Assert.IsTrue(Result.Contains('value1'), 'Should keep value1');
        Assert.IsTrue(Result.Contains('key2'), 'Should keep key2');
    end;
}
