codeunit 80092 "CG-AL-E032 Mock Token Provider" implements "CG Token Provider"
{
    var
        ClearCacheCallCount: Integer;

    procedure GetToken(Endpoint: Text; ForceRefresh: Boolean): Text
    var
        Suffix: Text[1];
    begin
        if ForceRefresh then
            Suffix := 'F'
        else
            Suffix := 'C';

        exit('TOKEN:' + Endpoint + ':' + Suffix);
    end;

    procedure ClearCache()
    begin
        ClearCacheCallCount += 1;
    end;

    procedure GetClearCacheCallCount(): Integer
    begin
        exit(ClearCacheCallCount);
    end;
}
