codeunit 80021 "CG-AL-H020 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        CollectionProcessor: Codeunit "CG Collection Processor";

    [Test]
    procedure TestJoinTexts_MultipleItems()
    var
        Items: List of [Text];
        Result: Text;
    begin
        Items.Add('apple');
        Items.Add('banana');
        Items.Add('cherry');

        Result := CollectionProcessor.JoinTexts(Items, ', ');

        Assert.AreEqual('apple, banana, cherry', Result, 'Should join with separator');
    end;

    [Test]
    procedure TestJoinTexts_EmptyList()
    var
        Items: List of [Text];
        Result: Text;
    begin
        Result := CollectionProcessor.JoinTexts(Items, ', ');

        Assert.AreEqual('', Result, 'Empty list should return empty string');
    end;

    [Test]
    procedure TestFilterByPrefix_MatchingItems()
    var
        Items, Result: List of [Text];
    begin
        Items.Add('apple');
        Items.Add('apricot');
        Items.Add('banana');
        Items.Add('avocado');

        Result := CollectionProcessor.FilterByPrefix(Items, 'ap');

        Assert.AreEqual(2, Result.Count(), 'Should find 2 items starting with ap');
    end;

    [Test]
    procedure TestFilterByPrefix_NoMatches()
    var
        Items, Result: List of [Text];
    begin
        Items.Add('banana');
        Items.Add('cherry');

        Result := CollectionProcessor.FilterByPrefix(Items, 'ap');

        Assert.AreEqual(0, Result.Count(), 'Should find no items');
    end;

    [Test]
    procedure TestSumDecimals_PositiveNumbers()
    var
        Numbers: List of [Decimal];
        Result: Decimal;
    begin
        Numbers.Add(10.5);
        Numbers.Add(20.3);
        Numbers.Add(5.2);

        Result := CollectionProcessor.SumDecimals(Numbers);

        Assert.AreEqual(36, Result, 'Sum should be 36');
    end;

    [Test]
    procedure TestMapToUpperCase_ModifiesInPlace()
    var
        Items: List of [Text];
        Item: Text;
    begin
        Items.Add('hello');
        Items.Add('world');

        CollectionProcessor.MapToUpperCase(Items);

        Items.Get(1, Item);
        Assert.AreEqual('HELLO', Item, 'First item should be uppercase');
        Items.Get(2, Item);
        Assert.AreEqual('WORLD', Item, 'Second item should be uppercase');
    end;

    [Test]
    procedure TestMergeDictionaries_CombinesEntries()
    var
        Dict1, Dict2, Result: Dictionary of [Text, Text];
        Value: Text;
    begin
        Dict1.Add('key1', 'value1');
        Dict1.Add('key2', 'value2');
        Dict2.Add('key3', 'value3');

        Result := CollectionProcessor.MergeDictionaries(Dict1, Dict2);

        Assert.AreEqual(3, Result.Count(), 'Should have 3 entries');
        Result.Get('key1', Value);
        Assert.AreEqual('value1', Value, 'key1 should exist');
    end;

    [Test]
    procedure TestMergeDictionaries_SecondOverwritesFirst()
    var
        Dict1, Dict2, Result: Dictionary of [Text, Text];
        Value: Text;
    begin
        Dict1.Add('key1', 'original');
        Dict2.Add('key1', 'overwritten');

        Result := CollectionProcessor.MergeDictionaries(Dict1, Dict2);

        Result.Get('key1', Value);
        Assert.AreEqual('overwritten', Value, 'Second dict should overwrite first');
    end;

    [Test]
    procedure TestGroupByFirstLetter_GroupsCorrectly()
    var
        Items: List of [Text];
        Result: Dictionary of [Text, List of [Text]];
        Group: List of [Text];
    begin
        Items.Add('apple');
        Items.Add('apricot');
        Items.Add('banana');

        Result := CollectionProcessor.GroupByFirstLetter(Items);

        Assert.IsTrue(Result.ContainsKey('a'), 'Should have group a');
        Assert.IsTrue(Result.ContainsKey('b'), 'Should have group b');
        Result.Get('a', Group);
        Assert.AreEqual(2, Group.Count(), 'Group a should have 2 items');
    end;

    [Test]
    procedure TestGetKeys_ReturnsAllKeys()
    var
        Dict: Dictionary of [Code[20], Decimal];
        Result: List of [Code[20]];
    begin
        Dict.Add('CODE1', 100);
        Dict.Add('CODE2', 200);
        Dict.Add('CODE3', 300);

        Result := CollectionProcessor.GetKeys(Dict);

        Assert.AreEqual(3, Result.Count(), 'Should return 3 keys');
    end;
}
