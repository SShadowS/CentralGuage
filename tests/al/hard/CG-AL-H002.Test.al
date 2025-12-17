codeunit 80002 "CG-AL-H002 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;

    [Test]
    procedure TestFlowFieldSum()
    var
        Warehouse: Record "CG Warehouse";
        WarehouseEntry: Record "CG Warehouse Entry";
        WhsCode: Code[10];
    begin
        // [SCENARIO] FlowField sums quantities correctly
        WhsCode := 'WHS001';

        Warehouse.Init();
        Warehouse.Code := WhsCode;
        Warehouse.Name := 'Test Warehouse';
        Warehouse.Insert(true);

        // Add entries
        WarehouseEntry.Init();
        WarehouseEntry."Warehouse Code" := WhsCode;
        WarehouseEntry."Item No." := 'ITEM1';
        WarehouseEntry.Quantity := 100;
        WarehouseEntry."Posting Date" := WorkDate();
        WarehouseEntry.Insert(true);

        WarehouseEntry.Init();
        WarehouseEntry."Warehouse Code" := WhsCode;
        WarehouseEntry."Item No." := 'ITEM2';
        WarehouseEntry.Quantity := 50.5;
        WarehouseEntry."Posting Date" := WorkDate();
        WarehouseEntry.Insert(true);

        // Verify FlowField
        Warehouse.Get(WhsCode);
        Warehouse.CalcFields("Total Inventory Qty");
        Assert.AreEqual(150.5, Warehouse."Total Inventory Qty", 'FlowField sum incorrect');

        // Cleanup
        WarehouseEntry.Reset();
        WarehouseEntry.SetRange("Warehouse Code", WhsCode);
        WarehouseEntry.DeleteAll(true);
        Warehouse.Delete(true);
    end;

    [Test]
    procedure TestFlowFieldCount()
    var
        Warehouse: Record "CG Warehouse";
        WarehouseEntry: Record "CG Warehouse Entry";
        WhsCode: Code[10];
    begin
        // [SCENARIO] FlowField counts entries correctly
        WhsCode := 'WHS002';

        Warehouse.Init();
        Warehouse.Code := WhsCode;
        Warehouse.Name := 'Test Warehouse 2';
        Warehouse.Insert(true);

        // Add 3 entries
        WarehouseEntry.Init();
        WarehouseEntry."Warehouse Code" := WhsCode;
        WarehouseEntry."Item No." := 'ITEM1';
        WarehouseEntry.Quantity := 10;
        WarehouseEntry.Insert(true);

        WarehouseEntry.Init();
        WarehouseEntry."Warehouse Code" := WhsCode;
        WarehouseEntry."Item No." := 'ITEM2';
        WarehouseEntry.Quantity := 20;
        WarehouseEntry.Insert(true);

        WarehouseEntry.Init();
        WarehouseEntry."Warehouse Code" := WhsCode;
        WarehouseEntry."Item No." := 'ITEM3';
        WarehouseEntry.Quantity := 30;
        WarehouseEntry.Insert(true);

        // Verify FlowField
        Warehouse.Get(WhsCode);
        Warehouse.CalcFields("Entry Count");
        Assert.AreEqual(3, Warehouse."Entry Count", 'FlowField count incorrect');

        // Cleanup
        WarehouseEntry.Reset();
        WarehouseEntry.SetRange("Warehouse Code", WhsCode);
        WarehouseEntry.DeleteAll(true);
        Warehouse.Delete(true);
    end;

    [Test]
    procedure TestFlowFieldWithNegativeQuantity()
    var
        Warehouse: Record "CG Warehouse";
        WarehouseEntry: Record "CG Warehouse Entry";
        WhsCode: Code[10];
    begin
        // [SCENARIO] FlowField handles negative quantities
        WhsCode := 'WHS003';

        Warehouse.Init();
        Warehouse.Code := WhsCode;
        Warehouse.Name := 'Test Warehouse 3';
        Warehouse.Insert(true);

        WarehouseEntry.Init();
        WarehouseEntry."Warehouse Code" := WhsCode;
        WarehouseEntry."Item No." := 'ITEM1';
        WarehouseEntry.Quantity := 100;
        WarehouseEntry.Insert(true);

        WarehouseEntry.Init();
        WarehouseEntry."Warehouse Code" := WhsCode;
        WarehouseEntry."Item No." := 'ITEM1';
        WarehouseEntry.Quantity := -30; // Negative adjustment
        WarehouseEntry.Insert(true);

        Warehouse.Get(WhsCode);
        Warehouse.CalcFields("Total Inventory Qty");
        Assert.AreEqual(70, Warehouse."Total Inventory Qty", 'FlowField should handle negative quantities');

        // Cleanup
        WarehouseEntry.Reset();
        WarehouseEntry.SetRange("Warehouse Code", WhsCode);
        WarehouseEntry.DeleteAll(true);
        Warehouse.Delete(true);
    end;

    [Test]
    procedure TestFlowFieldZeroWhenNoEntries()
    var
        Warehouse: Record "CG Warehouse";
        WhsCode: Code[10];
    begin
        // [SCENARIO] FlowField is 0 when no entries exist
        WhsCode := 'WHS004';

        Warehouse.Init();
        Warehouse.Code := WhsCode;
        Warehouse.Name := 'Empty Warehouse';
        Warehouse.Insert(true);

        Warehouse.Get(WhsCode);
        Warehouse.CalcFields("Total Inventory Qty", "Entry Count");
        Assert.AreEqual(0, Warehouse."Total Inventory Qty", 'FlowField sum should be 0 with no entries');
        Assert.AreEqual(0, Warehouse."Entry Count", 'FlowField count should be 0 with no entries');

        Warehouse.Delete(true);
    end;
}
