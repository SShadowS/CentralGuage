codeunit 80010 "CG-AL-E010 Test"
{
    // Tests for CG-AL-E010: Event Subscriber - Item Event Subscriber
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibraryInventory: Codeunit "Library - Inventory";

    [Test]
    procedure TestEventSubscriberCodeunitExists()
    var
        AllObj: Record AllObj;
    begin
        // [SCENARIO] Item Event Subscriber codeunit exists with correct ID
        // [GIVEN] The codeunit definition
        // [WHEN] We check for the codeunit in system objects
        // [THEN] Codeunit 70001 "Item Event Subscriber" exists
        AllObj.SetRange("Object Type", AllObj."Object Type"::Codeunit);
        AllObj.SetRange("Object ID", 70001);
        Assert.IsTrue(AllObj.FindFirst(), 'Codeunit 70001 should exist');
        Assert.AreEqual('Item Event Subscriber', AllObj."Object Name", 'Codeunit should be named "Item Event Subscriber"');
    end;

    [Test]
    procedure TestEventSubscriberCanBeInstantiated()
    var
        ItemEventSubscriber: Codeunit "Item Event Subscriber";
    begin
        // [SCENARIO] Item Event Subscriber codeunit can be instantiated
        // [GIVEN] The codeunit "Item Event Subscriber" definition with ID 70001
        // [WHEN] We create a variable of the codeunit type
        // [THEN] No error occurs - the codeunit exists and compiles
        Assert.IsTrue(true, 'Item Event Subscriber codeunit can be instantiated');
    end;

    [Test]
    procedure TestEventFiringOnInsert()
    var
        Item: Record Item;
    begin
        // [SCENARIO] Event subscriber fires when item is inserted without errors
        // [GIVEN] The event subscriber is bound to Item.OnAfterInsertEvent
        // [WHEN] We insert an item
        LibraryInventory.CreateItem(Item);

        // [THEN] No error occurs - the event subscriber executes successfully
        Assert.IsTrue(Item."No." <> '', 'Item should be created successfully');

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestMultipleItemInserts()
    var
        Item1: Record Item;
        Item2: Record Item;
        Item3: Record Item;
    begin
        // [SCENARIO] Event subscriber fires for each item insert without errors
        // [GIVEN] The event subscriber is bound to OnAfterInsertEvent
        // [WHEN] We insert multiple items
        LibraryInventory.CreateItem(Item1);
        LibraryInventory.CreateItem(Item2);
        LibraryInventory.CreateItem(Item3);

        // [THEN] All items are created successfully (event fires each time without error)
        Assert.IsTrue(Item1."No." <> '', 'First item should be created');
        Assert.IsTrue(Item2."No." <> '', 'Second item should be created');
        Assert.IsTrue(Item3."No." <> '', 'Third item should be created');

        // Cleanup
        Item1.Delete();
        Item2.Delete();
        Item3.Delete();
    end;

    [Test]
    procedure TestItemModificationAfterInsert()
    var
        Item: Record Item;
    begin
        // [SCENARIO] Item can be modified after insert (event subscriber doesn't block)
        // [GIVEN] An inserted item
        LibraryInventory.CreateItem(Item);

        // [WHEN] We modify the item
        Item.Description := 'Modified after insert';
        Item.Modify();

        // [THEN] Modification succeeds
        Item.Get(Item."No.");
        Assert.AreEqual('Modified after insert', Item.Description, 'Item should be modifiable after insert');

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestItemDeletionAfterInsert()
    var
        Item: Record Item;
        ItemNo: Code[20];
    begin
        // [SCENARIO] Item can be deleted after insert (event subscriber doesn't block deletion)
        // [GIVEN] An inserted item
        LibraryInventory.CreateItem(Item);
        ItemNo := Item."No.";

        // [WHEN] We delete the item
        Item.Delete();

        // [THEN] Item no longer exists
        Assert.IsFalse(Item.Get(ItemNo), 'Item should be deleted');
    end;

    [Test]
    procedure TestItemInsertWithDescription()
    var
        Item: Record Item;
    begin
        // [SCENARIO] Event subscriber handles items with descriptions
        // [GIVEN] The event subscriber is bound to OnAfterInsertEvent
        // [WHEN] We insert an item with a description
        LibraryInventory.CreateItem(Item);
        Item.Description := 'Test Item for Event Subscriber';
        Item.Modify();

        // [THEN] Item is created and modified without errors
        Item.Get(Item."No.");
        Assert.AreEqual('Test Item for Event Subscriber', Item.Description, 'Item description should be preserved');

        // Cleanup
        Item.Delete();
    end;
}
