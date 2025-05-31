tableextension 70200 "Customer Extension" extends Customer
{
    fields
    {
        field(70200; "Customer Rating"; Option)
        {
            Caption = 'Customer Rating';
            OptionMembers = "Not Rated",Bronze,Silver,Gold,Platinum;
            OptionCaption = 'Not Rated,Bronze,Silver,Gold,Platinum';
            DataClassification = CustomerContent;
        }
        field(70201; "Last Review Date"; Date)
        {
            Caption = 'Last Review Date';
            DataClassification = CustomerContent;
        }
        field(70202; "Loyalty Points"; Integer)
        {
            Caption = 'Loyalty Points';
            DataClassification = CustomerContent;
            MinValue = 0;
        }
        field(70203; "Marketing Consent"; Boolean)
        {
            Caption = 'Marketing Consent';
            DataClassification = CustomerContent;
        }
    }
    
    procedure UpdateCustomerRating()
    var
        CustLedgerEntry: Record "Cust. Ledger Entry";
        TotalSales: Decimal;
    begin
        TotalSales := 0;
        CustLedgerEntry.SetRange("Customer No.", Rec."No.");
        CustLedgerEntry.SetRange("Document Type", CustLedgerEntry."Document Type"::Invoice);
        if CustLedgerEntry.FindSet() then
            repeat
                TotalSales += CustLedgerEntry."Sales (LCY)";
            until CustLedgerEntry.Next() = 0;
            
        case TotalSales of
            0..999:
                Rec."Customer Rating" := Rec."Customer Rating"::"Not Rated";
            1000..4999:
                Rec."Customer Rating" := Rec."Customer Rating"::Bronze;
            5000..9999:
                Rec."Customer Rating" := Rec."Customer Rating"::Silver;
            10000..49999:
                Rec."Customer Rating" := Rec."Customer Rating"::Gold;
            else
                Rec."Customer Rating" := Rec."Customer Rating"::Platinum;
        end;
        
        Rec."Last Review Date" := Today();
        Rec.Modify();
    end;
}