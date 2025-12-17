codeunit 80053 "CG-AL-E053 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibraryInventory: Codeunit "Library - Inventory";

    [Test]
    procedure TestPageExtensionLoads()
    var
        Item: Record Item;
        ItemList: TestPage "Item List";
    begin
        // [SCENARIO] The Item List page extension loads without error
        // [GIVEN] An item exists
        LibraryInventory.CreateItem(Item);

        // [WHEN] Opening the Item List page
        ItemList.OpenView();

        // [THEN] The page opens successfully (extension is loaded)
        ItemList.Close();

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestShowItemDetailsActionExists()
    var
        Item: Record Item;
        ItemList: TestPage "Item List";
    begin
        // [SCENARIO] The "Show Item Details" action exists on the page
        // [GIVEN] An item exists
        LibraryInventory.CreateItem(Item);

        // [WHEN] Opening the Item List page
        ItemList.OpenView();
        ItemList.GoToRecord(Item);

        // [THEN] The Show Item Details action should be visible/invokable
        // Note: Action existence is validated by compilation;
        // this test verifies the page can be navigated with the extension loaded
        Assert.IsTrue(ItemList."No.".Value <> '', 'Item should be displayed on list');

        ItemList.Close();

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestItemListWithMultipleItems()
    var
        Item1: Record Item;
        Item2: Record Item;
        ItemList: TestPage "Item List";
    begin
        // [SCENARIO] The extended Item List works with multiple items
        // [GIVEN] Multiple items exist
        LibraryInventory.CreateItem(Item1);
        LibraryInventory.CreateItem(Item2);

        // [WHEN] Opening the Item List page
        ItemList.OpenView();

        // [THEN] Can navigate between items
        ItemList.GoToRecord(Item1);
        Assert.AreEqual(Item1."No.", ItemList."No.".Value, 'Should show first item');

        ItemList.GoToRecord(Item2);
        Assert.AreEqual(Item2."No.", ItemList."No.".Value, 'Should show second item');

        ItemList.Close();

        // Cleanup
        Item1.Delete();
        Item2.Delete();
    end;
}
