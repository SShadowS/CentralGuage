codeunit 80015 "CG-AL-H014 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        JsonParser: Codeunit "CG JSON Parser";

    [Test]
    procedure TestParseCustomerData_ValidData()
    var
        CustomerJson: JsonObject;
        Result: Text;
    begin
        CustomerJson.Add('name', 'John Doe');
        CustomerJson.Add('age', 30);
        CustomerJson.Add('active', true);

        Result := JsonParser.ParseCustomerData(CustomerJson);

        Assert.IsTrue(Result.Contains('John Doe'), 'Should contain customer name');
        Assert.IsTrue(Result.Contains('30'), 'Should contain age');
    end;

    [Test]
    procedure TestParseCustomerData_InactiveCustomer()
    var
        CustomerJson: JsonObject;
        Result: Text;
    begin
        CustomerJson.Add('name', 'Jane Smith');
        CustomerJson.Add('age', 25);
        CustomerJson.Add('active', false);

        Result := JsonParser.ParseCustomerData(CustomerJson);

        Assert.IsTrue(Result.Contains('Jane Smith'), 'Should contain customer name');
    end;

    [Test]
    procedure TestProcessOrderItems_MultipleItems()
    var
        OrderJson: JsonObject;
        ItemsArray: JsonArray;
        Item1, Item2, Item3: JsonObject;
        Result: Integer;
    begin
        Item1.Add('name', 'Widget');
        Item1.Add('quantity', 5);
        Item2.Add('name', 'Gadget');
        Item2.Add('quantity', 3);
        Item3.Add('name', 'Tool');
        Item3.Add('quantity', 7);

        ItemsArray.Add(Item1);
        ItemsArray.Add(Item2);
        ItemsArray.Add(Item3);
        OrderJson.Add('items', ItemsArray);

        Result := JsonParser.ProcessOrderItems(OrderJson);

        Assert.AreEqual(15, Result, 'Total quantity should be 15');
    end;

    [Test]
    procedure TestProcessOrderItems_EmptyArray()
    var
        OrderJson: JsonObject;
        ItemsArray: JsonArray;
        Result: Integer;
    begin
        OrderJson.Add('items', ItemsArray);

        Result := JsonParser.ProcessOrderItems(OrderJson);

        Assert.AreEqual(0, Result, 'Empty array should return 0');
    end;

    [Test]
    procedure TestSafeGetText_KeyExists()
    var
        TestJson: JsonObject;
        Result: Text;
    begin
        TestJson.Add('key1', 'value1');

        Result := JsonParser.SafeGetText(TestJson, 'key1', 'default');

        Assert.AreEqual('value1', Result, 'Should return actual value');
    end;

    [Test]
    procedure TestSafeGetText_KeyMissing()
    var
        TestJson: JsonObject;
        Result: Text;
    begin
        TestJson.Add('other', 'value');

        Result := JsonParser.SafeGetText(TestJson, 'missing', 'default');

        Assert.AreEqual('default', Result, 'Should return default value');
    end;

    [Test]
    procedure TestExtractNestedValue_DeepNesting()
    var
        RootJson, Level1, Level2: JsonObject;
        Result: Decimal;
    begin
        Level2.Add('amount', 123.45);
        Level1.Add('details', Level2);
        RootJson.Add('data', Level1);

        Result := JsonParser.ExtractNestedValue(RootJson);

        Assert.AreEqual(123.45, Result, 'Should extract nested decimal value');
    end;
}
