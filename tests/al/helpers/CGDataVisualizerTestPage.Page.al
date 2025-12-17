page 70092 "CG Data Visualizer Test Page"
{
    PageType = Card;
    ApplicationArea = All;
    UsageCategory = Administration;
    Caption = 'CG Data Visualizer Test';

    layout
    {
        area(Content)
        {
            usercontrol(DataViz; "CG Data Visualizer")
            {
                ApplicationArea = All;

                trigger ControlReady()
                begin
                    ControlIsReady := true;
                end;

                trigger DataPointSelected(Point: JsonObject)
                begin
                    LastSelectedPoint := Point;
                end;
            }
        }
    }

    actions
    {
        area(Processing)
        {
            action(Initialize)
            {
                ApplicationArea = All;
                Caption = 'Initialize';
                Image = Start;

                trigger OnAction()
                begin
                    CurrPage.DataViz.Initialize();
                end;
            }
            action(UpdateData)
            {
                ApplicationArea = All;
                Caption = 'Update Data';
                Image = Refresh;

                trigger OnAction()
                var
                    Data: JsonArray;
                begin
                    CurrPage.DataViz.UpdateData(Data);
                end;
            }
            action(SetTitle)
            {
                ApplicationArea = All;
                Caption = 'Set Title';
                Image = EditLines;

                trigger OnAction()
                begin
                    CurrPage.DataViz.SetTitle('Test Title');
                end;
            }
        }
    }

    var
        ControlIsReady: Boolean;
        LastSelectedPoint: JsonObject;
}
