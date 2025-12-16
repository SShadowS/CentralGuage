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
        // [SCENARIO] Supplier Rating field exists on Item as Option type
        // [GIVEN] An Item record
        LibraryInventory.CreateItem(Item);

        // [WHEN] We set Supplier Rating to Gold (ordinal 3)
        // Option values: Not Rated=0, Bronze=1, Silver=2, Gold=3, Platinum=4
        Item."Supplier Rating" := 3;  // Gold
        Item.Modify();

        // [THEN] The value is stored correctly
        Item.Get(Item."No.");
        Assert.AreEqual(3, Item."Supplier Rating", 'Supplier Rating should be Gold (3)');

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestSupplierRatingAllOptions()
    var
        Item: Record Item;
        i: Integer;
    begin
        // [SCENARIO] All Supplier Rating option values are valid
        // [GIVEN] An Item record
        LibraryInventory.CreateItem(Item);

        // [WHEN/THEN] We can set each option value (0-4)
        // Not Rated=0, Bronze=1, Silver=2, Gold=3, Platinum=4
        for i := 0 to 4 do begin
            Item."Supplier Rating" := i;
            Item.Modify();
            Item.Get(Item."No.");
            Assert.AreEqual(i, Item."Supplier Rating", StrSubstNo('Supplier Rating should be %1', i));
        end;

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
        Item."Supplier Rating" := 4;  // Platinum
        Item."Last Maintenance Date" := TestDate;
        Item."Special Instructions" := 'Test instructions';
        Item.Modify();

        // [THEN] All values are stored correctly
        Item.Get(Item."No.");
        Assert.AreEqual(24, Item."Warranty Period", 'Warranty Period should be stored');
        Assert.AreEqual(4, Item."Supplier Rating", 'Supplier Rating should be Platinum (4)');
        Assert.AreEqual(TestDate, Item."Last Maintenance Date", 'Last Maintenance Date should be stored');
        Assert.AreEqual('Test instructions', Item."Special Instructions", 'Special Instructions should be stored');

        // Cleanup
        Item.Delete();
    end;
}
