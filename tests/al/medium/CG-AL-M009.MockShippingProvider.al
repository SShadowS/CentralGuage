codeunit 80209 "CG-AL-M009 Mock Shipping" implements "Shipping Provider"
{
    // Mock implementation of Shipping Provider interface for testing
    // This validates that the LLM-generated interface has the correct signature

    procedure CalculateShippingCost(Weight: Decimal; FromCountry: Text; ToCountry: Text): Decimal
    var
        BaseCost: Decimal;
        WeightFactor: Decimal;
    begin
        // Mock: Calculate cost based on weight
        // Heavier packages cost more
        BaseCost := 5.00;
        WeightFactor := 0.50;

        if FromCountry <> ToCountry then
            BaseCost := BaseCost * 2; // International shipping costs more

        exit(BaseCost + (Weight * WeightFactor));
    end;

    procedure EstimateDeliveryTime(FromCountry: Text; ToCountry: Text; ServiceType: Text): Integer
    var
        BaseDays: Integer;
    begin
        // Mock: Estimate delivery days based on service type
        // Express is faster than Standard
        if ServiceType = 'Express' then
            BaseDays := 2
        else
            BaseDays := 5;

        if FromCountry <> ToCountry then
            BaseDays := BaseDays + 3; // International takes longer

        exit(BaseDays);
    end;

    procedure CreateShipment(OrderNumber: Text; FromAddress: Text; ToAddress: Text; Weight: Decimal): Text[50]
    begin
        // Mock: Generate tracking number from order number
        if (OrderNumber = '') or (FromAddress = '') or (ToAddress = '') or (Weight <= 0) then
            exit('');

        exit(CopyStr('TRACK-' + OrderNumber, 1, 50));
    end;

    procedure TrackShipment(TrackingNumber: Text): Text[100]
    begin
        // Mock: Return status based on tracking number
        if TrackingNumber = '' then
            exit('');

        exit(CopyStr('In Transit - ' + TrackingNumber, 1, 100));
    end;

    procedure ValidateAddress(Street: Text; City: Text; State: Text; ZipCode: Text; Country: Text): Boolean
    begin
        // Mock: Validate that all address components are provided
        if (Street = '') or (City = '') or (State = '') or (ZipCode = '') or (Country = '') then
            exit(false);

        exit(true);
    end;
}
