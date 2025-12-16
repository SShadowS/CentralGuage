codeunit 80003 "CG-AL-E003 Test"
{
    // Tests for CG-AL-E003: Basic Enum - Priority Level
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;

    [Test]
    procedure TestEnumValuesExist()
    var
        Priority: Enum "Priority Level";
    begin
        // [SCENARIO] Priority Level enum has all required values
        // [GIVEN] The Priority Level enum
        // [WHEN] We access each value
        // [THEN] All values exist and are distinct
        Priority := Priority::Low;
        Assert.AreEqual(Priority::Low, Priority, 'Low value should exist');

        Priority := Priority::Medium;
        Assert.AreEqual(Priority::Medium, Priority, 'Medium value should exist');

        Priority := Priority::High;
        Assert.AreEqual(Priority::High, Priority, 'High value should exist');

        Priority := Priority::Critical;
        Assert.AreEqual(Priority::Critical, Priority, 'Critical value should exist');
    end;

    [Test]
    procedure TestEnumOrdinalValues()
    var
        Priority: Enum "Priority Level";
    begin
        // [SCENARIO] Enum ordinal values are in expected order
        // [GIVEN] Priority Level enum values
        // [THEN] Ordinals are in ascending order
        Priority := Priority::Low;
        Assert.AreEqual(0, Priority.AsInteger(), 'Low should have ordinal 0');

        Priority := Priority::Medium;
        Assert.AreEqual(1, Priority.AsInteger(), 'Medium should have ordinal 1');

        Priority := Priority::High;
        Assert.AreEqual(2, Priority.AsInteger(), 'High should have ordinal 2');

        Priority := Priority::Critical;
        Assert.AreEqual(3, Priority.AsInteger(), 'Critical should have ordinal 3');
    end;

    [Test]
    procedure TestEnumNamesFromOrdinal()
    var
        Priority: Enum "Priority Level";
    begin
        // [SCENARIO] Enum values can be retrieved from ordinals
        // [GIVEN] Ordinal values
        // [WHEN] We convert to enum
        // [THEN] Correct enum value is returned
        Priority := "Priority Level".FromInteger(0);
        Assert.AreEqual(Priority::Low, Priority, 'Ordinal 0 should be Low');

        Priority := "Priority Level".FromInteger(1);
        Assert.AreEqual(Priority::Medium, Priority, 'Ordinal 1 should be Medium');

        Priority := "Priority Level".FromInteger(2);
        Assert.AreEqual(Priority::High, Priority, 'Ordinal 2 should be High');

        Priority := "Priority Level".FromInteger(3);
        Assert.AreEqual(Priority::Critical, Priority, 'Ordinal 3 should be Critical');
    end;

    [Test]
    procedure TestEnumComparisons()
    begin
        // [SCENARIO] Enum values can be compared using ordinal ordering
        // [GIVEN] Priority Level enum values
        // [WHEN] We perform comparisons
        // [THEN] Comparisons work correctly based on ordinal values
        Assert.IsTrue("Priority Level"::Critical > "Priority Level"::Low, 'Critical should be greater than Low');
        Assert.IsTrue("Priority Level"::Critical > "Priority Level"::Medium, 'Critical should be greater than Medium');
        Assert.IsTrue("Priority Level"::Critical > "Priority Level"::High, 'Critical should be greater than High');
        Assert.IsTrue("Priority Level"::High > "Priority Level"::Medium, 'High should be greater than Medium');
        Assert.IsTrue("Priority Level"::High > "Priority Level"::Low, 'High should be greater than Low');
        Assert.IsTrue("Priority Level"::Medium > "Priority Level"::Low, 'Medium should be greater than Low');
    end;

    [Test]
    procedure TestEnumCaptionsExist()
    var
        Priority: Enum "Priority Level";
        Caption: Text;
    begin
        // [SCENARIO] All enum values have captions
        // [GIVEN] Priority Level enum values
        // [WHEN] We get their captions
        // [THEN] Captions are not empty
        Priority := Priority::Low;
        Caption := Format(Priority);
        Assert.AreNotEqual('', Caption, 'Low should have a caption');

        Priority := Priority::Medium;
        Caption := Format(Priority);
        Assert.AreNotEqual('', Caption, 'Medium should have a caption');

        Priority := Priority::High;
        Caption := Format(Priority);
        Assert.AreNotEqual('', Caption, 'High should have a caption');

        Priority := Priority::Critical;
        Caption := Format(Priority);
        Assert.AreNotEqual('', Caption, 'Critical should have a caption');
    end;
}
