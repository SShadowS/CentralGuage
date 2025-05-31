page 70100 "Customer API"
{
    PageType = API;
    APIPublisher = 'centralgauge';
    APIGroup = 'test';
    APIVersion = 'v1.0';
    EntityName = 'customer';
    EntitySetName = 'customers';
    SourceTable = Customer;
    DelayedInsert = true;
    ODataKeyFields = SystemId;

    layout
    {
        area(Content)
        {
            repeater(Records)
            {
                field(id; Rec.SystemId)
                {
                    Caption = 'Id';
                    Editable = false;
                }
                field(number; Rec."No.")
                {
                    Caption = 'Number';
                }
                field(displayName; Rec.Name)
                {
                    Caption = 'Display Name';
                }
                field(type; Rec."Customer Type")
                {
                    Caption = 'Type';
                }
                field(addressLine1; Rec.Address)
                {
                    Caption = 'Address Line 1';
                }
                field(city; Rec.City)
                {
                    Caption = 'City';
                }
                field(state; Rec.County)
                {
                    Caption = 'State';
                }
                field(country; Rec."Country/Region Code")
                {
                    Caption = 'Country/Region Code';
                }
                field(postalCode; Rec."Post Code")
                {
                    Caption = 'Postal Code';
                }
                field(phoneNumber; Rec."Phone No.")
                {
                    Caption = 'Phone Number';
                }
                field(email; Rec."E-Mail")
                {
                    Caption = 'Email';
                }
            }
        }
    }
}