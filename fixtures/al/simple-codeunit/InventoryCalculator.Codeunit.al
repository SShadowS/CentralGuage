codeunit 70000 "Inventory Calculator"
{
    Access = Public;

    procedure CalculateInventoryValue(): Decimal
    var
        Item: Record Item;
        TotalValue: Decimal;
    begin
        TotalValue := 0;
        
        if Item.FindSet() then
            repeat
                TotalValue += Item."Unit Cost" * Item.Inventory;
            until Item.Next() = 0;
            
        exit(TotalValue);
    end;
    
    procedure CalculateItemValue(ItemNo: Code[20]): Decimal
    var
        Item: Record Item;
    begin
        if Item.Get(ItemNo) then
            exit(Item."Unit Cost" * Item.Inventory)
        else
            exit(0);
    end;
}