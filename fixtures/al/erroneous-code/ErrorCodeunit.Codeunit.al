codeunit 70300 "Error Codeunit"
{
    // Missing Access property - will cause warning/error
    
    procedure CalculateTotalWithErrors(): Decimal
    var
        Item: Record Item;
        TotalValue: Decimal;
        UndeclaredVariable: Integer; // Declared but never used - will cause warning
    begin
        TotalValue := 0;
        
        // Missing 'if' statement - will cause error
        Item.FindSet() then
            repeat
                // Wrong field reference - 'Unit Cost' should be "Unit Cost"
                TotalValue += Item.Unit Cost * Item.Inventory;
            until Item.Next() = 0;
            
        // Missing semicolon - will cause error
        exit(TotalValue)
    end;
    
    // Function with no implementation - will cause error
    procedure MissingImplementation()
    
    procedure TypeMismatchError()
    var
        NumberVar: Integer;
        TextVar: Text;
    begin
        // Type mismatch - assigning text to integer
        NumberVar := 'This is text';
        
        // Undefined function call
        TextVar := SomeUndefinedFunction();
    end;
}