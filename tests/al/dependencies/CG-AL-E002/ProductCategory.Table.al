table 69001 "Product Category"
{
    Caption = 'Product Category';
    DataClassification = CustomerContent;

    fields
    {
        field(1; "Code"; Code[20])
        {
            Caption = 'Code';
            NotBlank = true;
        }
        field(2; "Description"; Text[100])
        {
            Caption = 'Description';
        }
        field(3; "Active"; Boolean)
        {
            Caption = 'Active';
            InitValue = true;
        }
        field(4; "Created Date"; Date)
        {
            Caption = 'Created Date';
        }
    }

    keys
    {
        key(PK; "Code")
        {
            Clustered = true;
        }
    }
}
