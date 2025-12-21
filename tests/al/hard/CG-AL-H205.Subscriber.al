codeunit 80091 "CG Line Amount Subscriber"
{
    [EventSubscriber(ObjectType::Codeunit, Codeunit::"CG Line Amount Engine", 'OnAfterCalculateLineAmount', '', false, false)]
    local procedure OnAfterCalculateLineAmount(var Result: Decimal; UnitPrice: Decimal; Quantity: Decimal; DiscountPercent: Decimal; RoundingPrecision: Decimal)
    var
        Spy: Codeunit "CG Line Amount Spy";
    begin
        Spy.SetInvoked();

        if (UnitPrice = 10) and (Quantity = 1) and (DiscountPercent = 0) then
            Result := Result + RoundingPrecision;
    end;
}
