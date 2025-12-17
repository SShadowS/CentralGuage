codeunit 70090 "CG Line Amount Spy"
{
    SingleInstance = true;

    var
        Invoked: Boolean;

    procedure Reset()
    begin
        Invoked := false;
    end;

    procedure SetInvoked()
    begin
        Invoked := true;
    end;

    procedure WasInvoked(): Boolean
    begin
        exit(Invoked);
    end;
}
