table 69228 "CG Related Record"
{
    Caption = 'CG Related Record';
    DataClassification = CustomerContent;

    fields
    {
        field(1; "Entry No."; Integer)
        {
            Caption = 'Entry No.';
            AutoIncrement = true;
        }
        field(2; "Parent Code"; Code[20])
        {
            Caption = 'Parent Code';
            TableRelation = "CG Test Record".Code;
        }
        field(3; "Line Description"; Text[100])
        {
            Caption = 'Line Description';
        }
        field(4; "Line Amount"; Decimal)
        {
            Caption = 'Line Amount';
        }
        field(5; "Created Date"; Date)
        {
            Caption = 'Created Date';
        }
        field(6; "Customer No."; Code[20])
        {
            Caption = 'Customer No.';
            TableRelation = Customer."No.";
        }
    }

    keys
    {
        key(PK; "Entry No.")
        {
            Clustered = true;
        }
        key(ParentKey; "Parent Code", "Entry No.")
        {
        }
    }
}
