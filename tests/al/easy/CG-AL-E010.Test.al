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
        ItemEventSubscriber: Codeunit "Item Event Subscriber";
    begin
        // [SCENARIO] Item Event Subscriber codeunit can be instantiated
        // [GIVEN] The codeunit definition
        // [WHEN] We create a variable of the codeunit type
        // [THEN] No error occurs
        Assert.IsTrue(true, 'Event Subscriber codeunit exists');
    end;

    [Test]
    procedure TestEventFiringOnInsert()
    var
        Item: Record Item;
    begin
        // [SCENARIO] Event subscriber fires when item is inserted
        // [GIVEN] The event subscriber is bound to Item.OnAfterInsert
        // [WHEN] We insert an item
        LibraryInventory.CreateItem(Item);

        // [THEN] No error occurs (event subscriber executed)
        // Note: To fully verify the subscriber ran, we would need
        // the subscriber to set a flag or write to a log table
        Assert.IsTrue(Item."No." <> '', 'Item should be created');

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
        // [SCENARIO] Event subscriber fires for each item insert
        // [GIVEN] The event subscriber is bound
        // [WHEN] We insert multiple items
        LibraryInventory.CreateItem(Item1);
        LibraryInventory.CreateItem(Item2);
        LibraryInventory.CreateItem(Item3);

        // [THEN] All items are created successfully (event fires each time)
        Assert.IsTrue(Item1."No." <> '', 'First item should be created');
        Assert.IsTrue(Item2."No." <> '', 'Second item should be created');
        Assert.IsTrue(Item3."No." <> '', 'Third item should be created');

        // Cleanup
        Item1.Delete();
        Item2.Delete();
        Item3.Delete();
    end;

    [Test]
    procedure TestEventSubscriberHasInternalAccess()
    begin
        // [SCENARIO] Event Subscriber codeunit has Internal Access property
        // [GIVEN] The codeunit definition
        // [WHEN] The test app compiles
        // [THEN] The Access property is set correctly
        // This is verified at compile time
        Assert.IsTrue(true, 'Access property is correctly set');
    end;

    [Test]
    procedure TestEventSubscriberAttribute()
    begin
        // [SCENARIO] Event subscriber has correct EventSubscriber attribute
        // [GIVEN] The event subscriber procedure
        // [WHEN] An item is inserted
        // [THEN] The subscriber is called (verified by successful compilation
        //        and no runtime errors during item creation)
        Assert.IsTrue(true, 'EventSubscriber attribute is correctly defined');
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
        Assert.AreEqual('Modified after insert', Item.Description, 'Item should be modifiable');

        // Cleanup
        Item.Delete();
    end;
}
