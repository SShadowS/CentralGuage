codeunit 80004 "CG-AL-E004 Test"
{
    // Tests for CG-AL-E004: Table Extension - Item Extension
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibraryInventory: Codeunit "Library - Inventory";

    [Test]
    procedure TestWarrantyPeriodField()
    var
        Item: Record Item;
    begin
        // [SCENARIO] Warranty Period field exists on Item
        // [GIVEN] An Item record
        LibraryInventory.CreateItem(Item);

        // [WHEN] We access the Warranty Period field
        Item."Warranty Period" := 12;
        Item.Modify();

        // [THEN] The value is stored correctly
        Item.Get(Item."No.");
        Assert.AreEqual(12, Item."Warranty Period", 'Warranty Period should be stored');

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestSupplierRatingField()
    var
        Item: Record Item;
    begin
        // [SCENARIO] Supplier Rating field exists on Item
        // [GIVEN] An Item record
        LibraryInventory.CreateItem(Item);

        // [WHEN] We access the Supplier Rating field
        Item."Supplier Rating" := 5;
        Item.Modify();

        // [THEN] The value is stored correctly
        Item.Get(Item."No.");
        Assert.AreEqual(5, Item."Supplier Rating", 'Supplier Rating should be stored');

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestLastMaintenanceDateField()
    var
        Item: Record Item;
        TestDate: Date;
    begin
        // [SCENARIO] Last Maintenance Date field exists on Item
        // [GIVEN] An Item record
        LibraryInventory.CreateItem(Item);
        TestDate := WorkDate();

        // [WHEN] We access the Last Maintenance Date field
        Item."Last Maintenance Date" := TestDate;
        Item.Modify();

        // [THEN] The value is stored correctly
        Item.Get(Item."No.");
        Assert.AreEqual(TestDate, Item."Last Maintenance Date", 'Last Maintenance Date should be stored');

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestSpecialInstructionsField()
    var
        Item: Record Item;
        Instructions: Text[250];
    begin
        // [SCENARIO] Special Instructions field exists on Item
        // [GIVEN] An Item record
        LibraryInventory.CreateItem(Item);
        Instructions := 'Handle with care. Keep refrigerated.';

        // [WHEN] We access the Special Instructions field
        Item."Special Instructions" := Instructions;
        Item.Modify();

        // [THEN] The value is stored correctly
        Item.Get(Item."No.");
        Assert.AreEqual(Instructions, Item."Special Instructions", 'Special Instructions should be stored');

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestAllExtensionFieldsTogether()
    var
        Item: Record Item;
        TestDate: Date;
    begin
        // [SCENARIO] All extension fields can be used together
        // [GIVEN] An Item record
        LibraryInventory.CreateItem(Item);
        TestDate := WorkDate();

        // [WHEN] We set all extension fields
        Item."Warranty Period" := 24;
        Item."Supplier Rating" := 4;
        Item."Last Maintenance Date" := TestDate;
        Item."Special Instructions" := 'Test instructions';
        Item.Modify();

        // [THEN] All values are stored correctly
        Item.Get(Item."No.");
        Assert.AreEqual(24, Item."Warranty Period", 'Warranty Period should be stored');
        Assert.AreEqual(4, Item."Supplier Rating", 'Supplier Rating should be stored');
        Assert.AreEqual(TestDate, Item."Last Maintenance Date", 'Last Maintenance Date should be stored');
        Assert.AreEqual('Test instructions', Item."Special Instructions", 'Special Instructions should be stored');

        // Cleanup
        Item.Delete();
    end;
}
