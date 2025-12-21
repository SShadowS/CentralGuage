codeunit 80227 "CG-AL-H023 Mock Transformer" implements "IFieldTransformer"
{
    Access = Public;

    var
        UppercaseTextFields: Boolean;
        MultiplyDecimals: Boolean;
        MultiplierValue: Decimal;

    procedure SetUppercaseTextFields(Value: Boolean)
    begin
        UppercaseTextFields := Value;
    end;

    procedure SetMultiplyDecimals(Value: Boolean; Multiplier: Decimal)
    begin
        MultiplyDecimals := Value;
        MultiplierValue := Multiplier;
    end;

    procedure Transform(var FRef: FieldRef): Variant
    var
        TextValue: Text;
        DecimalValue: Decimal;
    begin
        // Transform text fields to uppercase
        if UppercaseTextFields then
            if (FRef.Type = FieldType::Text) or (FRef.Type = FieldType::Code) then begin
                TextValue := FRef.Value;
                exit(UpperCase(TextValue));
            end;

        // Multiply decimal fields
        if MultiplyDecimals then
            if FRef.Type = FieldType::Decimal then begin
                DecimalValue := FRef.Value;
                exit(DecimalValue * MultiplierValue);
            end;

        // Return current value unchanged
        exit(FRef.Value);
    end;
}
