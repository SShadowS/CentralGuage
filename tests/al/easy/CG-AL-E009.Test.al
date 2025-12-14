codeunit 80009 "CG-AL-E009 Test"
{
    // Tests for CG-AL-E009: Basic XMLport - Item Export
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibraryInventory: Codeunit "Library - Inventory";
        LibraryUtility: Codeunit "Library - Utility";

    [Test]
    procedure TestXMLportExists()
    var
        ItemExport: XMLport "Item Export";
    begin
        // [SCENARIO] Item Export XMLport can be instantiated
        // [GIVEN] The XMLport definition
        // [WHEN] We create a variable of the XMLport type
        // [THEN] No error occurs
        Assert.IsTrue(true, 'XMLport can be instantiated');
    end;

    [Test]
    procedure TestXMLportExportsToFile()
    var
        Item: Record Item;
        ItemExport: XMLport "Item Export";
        TempBlob: Codeunit "Temp Blob";
        OutStream: OutStream;
        InStream: InStream;
        XMLText: Text;
    begin
        // [SCENARIO] Item Export XMLport can export items to XML
        // [GIVEN] An item record
        LibraryInventory.CreateItem(Item);

        // [WHEN] We export using the XMLport
        TempBlob.CreateOutStream(OutStream);
        Item.SetRange("No.", Item."No.");
        ItemExport.SetTableView(Item);
        ItemExport.SetDestination(OutStream);
        ItemExport.Export();

        // [THEN] XML content is generated
        TempBlob.CreateInStream(InStream);
        InStream.Read(XMLText);
        Assert.AreNotEqual('', XMLText, 'XML content should be generated');

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestXMLportContainsItemData()
    var
        Item: Record Item;
        ItemExport: XMLport "Item Export";
        TempBlob: Codeunit "Temp Blob";
        OutStream: OutStream;
        InStream: InStream;
        XMLText: Text;
    begin
        // [SCENARIO] Exported XML contains item data
        // [GIVEN] An item with specific data
        LibraryInventory.CreateItem(Item);
        Item.Description := 'Test Item Description';
        Item."Unit Price" := 99.99;
        Item.Modify();

        // [WHEN] We export using the XMLport
        TempBlob.CreateOutStream(OutStream);
        Item.SetRange("No.", Item."No.");
        ItemExport.SetTableView(Item);
        ItemExport.SetDestination(OutStream);
        ItemExport.Export();

        // [THEN] XML contains the item number
        TempBlob.CreateInStream(InStream);
        InStream.Read(XMLText);
        Assert.IsTrue(XMLText.Contains(Item."No."), 'XML should contain item number');

        // Cleanup
        Item.Delete();
    end;

    [Test]
    procedure TestXMLportMultipleItems()
    var
        Item1: Record Item;
        Item2: Record Item;
        Item: Record Item;
        ItemExport: XMLport "Item Export";
        TempBlob: Codeunit "Temp Blob";
        OutStream: OutStream;
        InStream: InStream;
        XMLText: Text;
    begin
        // [SCENARIO] XMLport can export multiple items
        // [GIVEN] Multiple item records
        LibraryInventory.CreateItem(Item1);
        LibraryInventory.CreateItem(Item2);

        // [WHEN] We export all items
        TempBlob.CreateOutStream(OutStream);
        Item.SetFilter("No.", '%1|%2', Item1."No.", Item2."No.");
        ItemExport.SetTableView(Item);
        ItemExport.SetDestination(OutStream);
        ItemExport.Export();

        // [THEN] XML contains both items
        TempBlob.CreateInStream(InStream);
        InStream.Read(XMLText);
        Assert.IsTrue(XMLText.Contains(Item1."No."), 'XML should contain first item');
        Assert.IsTrue(XMLText.Contains(Item2."No."), 'XML should contain second item');

        // Cleanup
        Item1.Delete();
        Item2.Delete();
    end;

    [Test]
    procedure TestXMLportRootElement()
    var
        Item: Record Item;
        ItemExport: XMLport "Item Export";
        TempBlob: Codeunit "Temp Blob";
        OutStream: OutStream;
        InStream: InStream;
        XMLText: Text;
    begin
        // [SCENARIO] Exported XML has correct root element
        // [GIVEN] An item record
        LibraryInventory.CreateItem(Item);

        // [WHEN] We export using the XMLport
        TempBlob.CreateOutStream(OutStream);
        Item.SetRange("No.", Item."No.");
        ItemExport.SetTableView(Item);
        ItemExport.SetDestination(OutStream);
        ItemExport.Export();

        // [THEN] XML has Items root element
        TempBlob.CreateInStream(InStream);
        InStream.Read(XMLText);
        Assert.IsTrue(XMLText.Contains('<Items'), 'XML should have Items root element');

        // Cleanup
        Item.Delete();
    end;
}
