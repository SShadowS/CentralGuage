codeunit 70001 "Inventory Calculator Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    [Test]
    procedure TestCalculateInventoryValue()
    var
        InventoryCalculator: Codeunit "Inventory Calculator";
        TotalValue: Decimal;
    begin
        // Test that the function returns a decimal value
        TotalValue := InventoryCalculator.CalculateInventoryValue();
        Assert.IsTrue(TotalValue >= 0, 'Inventory value should be non-negative');
    end;
    
    [Test]
    procedure TestCalculateItemValue()
    var
        InventoryCalculator: Codeunit "Inventory Calculator";
        ItemValue: Decimal;
    begin
        // Test with non-existent item
        ItemValue := InventoryCalculator.CalculateItemValue('NONEXISTENT');
        Assert.AreEqual(0, ItemValue, 'Non-existent item should return 0');
    end;

    var
        Assert: Codeunit Assert;
}