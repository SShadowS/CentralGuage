codeunit 80020 "CG-AL-M020 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        JsonExtractor: Codeunit "CG JSON Value Extractor";

    [Test]
    procedure TestExtractProductInfo_AllFields()
    var
        ProductJson: JsonObject;
        Result: Text;
    begin
        ProductJson.Add('name', 'Widget');
        ProductJson.Add('price', 29.99);
        ProductJson.Add('inStock', true);
        ProductJson.Add('quantity', 150);

        Result := JsonExtractor.ExtractProductInfo(ProductJson);

        Assert.IsTrue(Result.Contains('Widget'), 'Should contain product name');
        Assert.IsTrue(Result.Contains('29.99') or Result.Contains('29,99'), 'Should contain price');
        Assert.IsTrue(Result.ToLower().Contains('true') or Result.Contains('Yes'), 'Should contain inStock status');
        Assert.IsTrue(Result.Contains('150'), 'Should contain quantity');
    end;

    [Test]
    procedure TestExtractProductInfo_DifferentProduct()
    var
        ProductJson: JsonObject;
        Result: Text;
    begin
        ProductJson.Add('name', 'Gadget Pro');
        ProductJson.Add('price', 199.00);
        ProductJson.Add('inStock', false);
        ProductJson.Add('quantity', 0);

        Result := JsonExtractor.ExtractProductInfo(ProductJson);

        Assert.IsTrue(Result.Contains('Gadget Pro'), 'Should contain product name');
        Assert.IsTrue(Result.Contains('199'), 'Should contain price');
        Assert.IsTrue(Result.Contains('0'), 'Should contain zero quantity');
    end;

    [Test]
    procedure TestExtractProductInfo_FormatStructure()
    var
        ProductJson: JsonObject;
        Result: Text;
    begin
        ProductJson.Add('name', 'Test');
        ProductJson.Add('price', 10.00);
        ProductJson.Add('inStock', true);
        ProductJson.Add('quantity', 5);

        Result := JsonExtractor.ExtractProductInfo(ProductJson);

        Assert.IsTrue(Result.Contains('Product'), 'Should have Product label');
        Assert.IsTrue(Result.Contains('Price'), 'Should have Price label');
        Assert.IsTrue(Result.Contains('Stock'), 'Should have Stock label');
        Assert.IsTrue(Result.Contains('Qty') or Result.Contains('Quantity'), 'Should have Quantity label');
    end;

    [Test]
    procedure TestExtractWithDefaults_KeyExists()
    var
        DataJson: JsonObject;
        Result: Text;
    begin
        DataJson.Add('status', 'active');
        DataJson.Add('name', 'TestItem');

        Result := JsonExtractor.ExtractWithDefaults(DataJson, 'status');

        Assert.AreEqual('active', Result, 'Should return existing value');
    end;

    [Test]
    procedure TestExtractWithDefaults_KeyMissing()
    var
        DataJson: JsonObject;
        Result: Text;
    begin
        DataJson.Add('status', 'active');

        Result := JsonExtractor.ExtractWithDefaults(DataJson, 'missing_key');

        Assert.AreEqual('N/A', Result, 'Should return N/A for missing key');
    end;

    [Test]
    procedure TestExtractWithDefaults_EmptyObject()
    var
        DataJson: JsonObject;
        Result: Text;
    begin
        Result := JsonExtractor.ExtractWithDefaults(DataJson, 'anykey');

        Assert.AreEqual('N/A', Result, 'Should return N/A for empty object');
    end;

    [Test]
    procedure TestSumArrayValues_BasicSum()
    var
        DataJson: JsonObject;
        ValuesArray: JsonArray;
        Result: Integer;
    begin
        ValuesArray.Add(10);
        ValuesArray.Add(20);
        ValuesArray.Add(30);
        ValuesArray.Add(40);
        ValuesArray.Add(50);
        DataJson.Add('values', ValuesArray);

        Result := JsonExtractor.SumArrayValues(DataJson);

        Assert.AreEqual(150, Result, 'Sum should be 150');
    end;

    [Test]
    procedure TestSumArrayValues_SingleValue()
    var
        DataJson: JsonObject;
        ValuesArray: JsonArray;
        Result: Integer;
    begin
        ValuesArray.Add(42);
        DataJson.Add('values', ValuesArray);

        Result := JsonExtractor.SumArrayValues(DataJson);

        Assert.AreEqual(42, Result, 'Sum of single value should be 42');
    end;

    [Test]
    procedure TestSumArrayValues_EmptyArray()
    var
        DataJson: JsonObject;
        ValuesArray: JsonArray;
        Result: Integer;
    begin
        DataJson.Add('values', ValuesArray);

        Result := JsonExtractor.SumArrayValues(DataJson);

        Assert.AreEqual(0, Result, 'Sum of empty array should be 0');
    end;

    [Test]
    procedure TestSumArrayValues_LargeNumbers()
    var
        DataJson: JsonObject;
        ValuesArray: JsonArray;
        Result: Integer;
    begin
        ValuesArray.Add(1000);
        ValuesArray.Add(2000);
        ValuesArray.Add(3000);
        DataJson.Add('values', ValuesArray);

        Result := JsonExtractor.SumArrayValues(DataJson);

        Assert.AreEqual(6000, Result, 'Sum should be 6000');
    end;

    [Test]
    procedure TestParseConfigSettings_AllSettings()
    var
        ConfigJson: JsonObject;
        Result: Dictionary of [Text, Text];
    begin
        ConfigJson.Add('debug', false);
        ConfigJson.Add('maxRetries', 3);
        ConfigJson.Add('timeout', 30.5);
        ConfigJson.Add('environment', 'production');

        Result := JsonExtractor.ParseConfigSettings(ConfigJson);

        Assert.AreEqual(4, Result.Count, 'Should have 4 settings');
        Assert.IsTrue(Result.ContainsKey('debug'), 'Should have debug key');
        Assert.IsTrue(Result.ContainsKey('maxRetries'), 'Should have maxRetries key');
        Assert.IsTrue(Result.ContainsKey('timeout'), 'Should have timeout key');
        Assert.IsTrue(Result.ContainsKey('environment'), 'Should have environment key');
    end;

    [Test]
    procedure TestParseConfigSettings_VerifyValues()
    var
        ConfigJson: JsonObject;
        Result: Dictionary of [Text, Text];
        Value: Text;
    begin
        ConfigJson.Add('debug', true);
        ConfigJson.Add('maxRetries', 5);
        ConfigJson.Add('timeout', 60.0);
        ConfigJson.Add('environment', 'staging');

        Result := JsonExtractor.ParseConfigSettings(ConfigJson);

        Result.Get('environment', Value);
        Assert.AreEqual('staging', Value, 'Environment should be staging');

        Result.Get('maxRetries', Value);
        Assert.AreEqual('5', Value, 'maxRetries should be 5');
    end;

    [Test]
    procedure TestHandleMissingKeys_RequiredExists()
    var
        PartialJson: JsonObject;
        Result: Text;
    begin
        PartialJson.Add('required', 'RequiredValue');
        PartialJson.Add('optional', 'OptionalValue');

        Result := JsonExtractor.HandleMissingKeys(PartialJson);

        Assert.AreEqual('RequiredValue', Result, 'Should return required value');
    end;

    [Test]
    procedure TestHandleMissingKeys_OnlyOptional()
    var
        PartialJson: JsonObject;
        Result: Text;
    begin
        PartialJson.Add('optional', 'FallbackValue');

        Result := JsonExtractor.HandleMissingKeys(PartialJson);

        Assert.AreEqual('FallbackValue', Result, 'Should return optional value when required missing');
    end;

    [Test]
    procedure TestHandleMissingKeys_NeitherExists()
    var
        PartialJson: JsonObject;
        Result: Text;
    begin
        PartialJson.Add('other', 'SomeValue');

        Result := JsonExtractor.HandleMissingKeys(PartialJson);

        Assert.AreEqual('none', Result, 'Should return none when both keys missing');
    end;

    [Test]
    procedure TestHandleMissingKeys_EmptyObject()
    var
        PartialJson: JsonObject;
        Result: Text;
    begin
        Result := JsonExtractor.HandleMissingKeys(PartialJson);

        Assert.AreEqual('none', Result, 'Should return none for empty object');
    end;

    [Test]
    procedure TestHandleMissingKeys_RequiredEmpty()
    var
        PartialJson: JsonObject;
        Result: Text;
    begin
        PartialJson.Add('required', '');
        PartialJson.Add('optional', 'Backup');

        Result := JsonExtractor.HandleMissingKeys(PartialJson);

        // Empty string is still a valid value for required
        Assert.AreEqual('', Result, 'Should return empty required value');
    end;
}
