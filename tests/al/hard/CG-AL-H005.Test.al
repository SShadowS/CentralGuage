codeunit 80006 "CG-AL-H005 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;

    [Test]
    procedure TestAuditLogOnPriceChange()
    var
        TrackedItem: Record "CG Tracked Item";
        AuditLog: Record "CG Audit Log";
        ItemCode: Code[20];
    begin
        // [SCENARIO] Changing Unit Price creates audit log entry
        ItemCode := 'AUDIT001';

        TrackedItem.Init();
        TrackedItem.Code := ItemCode;
        TrackedItem.Description := 'Test Item';
        TrackedItem."Unit Price" := 100;
        TrackedItem.Insert(true);

        // Change price
        TrackedItem."Unit Price" := 150;
        TrackedItem.Modify(true);

        // Verify audit log
        AuditLog.SetRange("Field Changed", 'Unit Price');
        AuditLog.SetFilter("Old Value", '%1', '100');
        AuditLog.SetFilter("New Value", '%1', '150');
        Assert.IsTrue(AuditLog.FindFirst(), 'Audit log entry should exist for price change');

        // Cleanup
        AuditLog.DeleteAll(true);
        TrackedItem.Delete(true);
    end;

    [Test]
    procedure TestAuditLogOnBlockedChange()
    var
        TrackedItem: Record "CG Tracked Item";
        AuditLog: Record "CG Audit Log";
        ItemCode: Code[20];
    begin
        // [SCENARIO] Changing Blocked from false to true creates audit log
        ItemCode := 'AUDIT002';

        TrackedItem.Init();
        TrackedItem.Code := ItemCode;
        TrackedItem.Description := 'Test Item 2';
        TrackedItem."Unit Price" := 50;
        TrackedItem.Blocked := false;
        TrackedItem.Insert(true);

        // Block the item
        TrackedItem.Blocked := true;
        TrackedItem.Modify(true);

        // Verify audit log
        AuditLog.SetRange("Field Changed", 'Blocked');
        AuditLog.SetRange("Old Value", 'No');
        AuditLog.SetRange("New Value", 'Yes');
        Assert.IsTrue(AuditLog.FindFirst(), 'Audit log entry should exist for Blocked change');

        // Cleanup
        AuditLog.DeleteAll(true);
        TrackedItem.Delete(true);
    end;

    [Test]
    procedure TestNoAuditLogWhenUnblocking()
    var
        TrackedItem: Record "CG Tracked Item";
        AuditLog: Record "CG Audit Log";
        ItemCode: Code[20];
        CountBefore: Integer;
    begin
        // [SCENARIO] Changing Blocked from true to false does NOT create audit log
        ItemCode := 'AUDIT003';

        TrackedItem.Init();
        TrackedItem.Code := ItemCode;
        TrackedItem.Description := 'Test Item 3';
        TrackedItem."Unit Price" := 75;
        TrackedItem.Blocked := true;
        TrackedItem.Insert(true);

        CountBefore := AuditLog.Count();

        // Unblock the item
        TrackedItem.Blocked := false;
        TrackedItem.Modify(true);

        // Should not create new audit log for unblocking
        AuditLog.SetRange("Field Changed", 'Blocked');
        AuditLog.SetRange("Old Value", 'Yes');
        AuditLog.SetRange("New Value", 'No');
        Assert.IsTrue(AuditLog.IsEmpty(), 'Unblocking should NOT create audit log');

        // Cleanup
        TrackedItem.Delete(true);
    end;

    [Test]
    procedure TestNoAuditLogWhenNoChange()
    var
        TrackedItem: Record "CG Tracked Item";
        AuditLog: Record "CG Audit Log";
        ItemCode: Code[20];
        CountBefore: Integer;
    begin
        // [SCENARIO] Modifying without actual change should not create audit log
        ItemCode := 'AUDIT004';

        TrackedItem.Init();
        TrackedItem.Code := ItemCode;
        TrackedItem.Description := 'Test Item 4';
        TrackedItem."Unit Price" := 200;
        TrackedItem.Insert(true);

        CountBefore := AuditLog.Count();

        // Modify with same value
        TrackedItem."Unit Price" := 200;
        TrackedItem.Modify(true);

        Assert.AreEqual(CountBefore, AuditLog.Count(), 'No audit log should be created when value unchanged');

        // Cleanup
        TrackedItem.Delete(true);
    end;

    [Test]
    procedure TestAuditLogAutoIncrement()
    var
        TrackedItem: Record "CG Tracked Item";
        AuditLog: Record "CG Audit Log";
        ItemCode: Code[20];
        FirstEntryNo: Integer;
        SecondEntryNo: Integer;
    begin
        // [SCENARIO] Audit log Entry No. auto-increments
        ItemCode := 'AUDIT005';

        TrackedItem.Init();
        TrackedItem.Code := ItemCode;
        TrackedItem."Unit Price" := 10;
        TrackedItem.Insert(true);

        TrackedItem."Unit Price" := 20;
        TrackedItem.Modify(true);

        AuditLog.FindLast();
        FirstEntryNo := AuditLog."Entry No.";

        TrackedItem."Unit Price" := 30;
        TrackedItem.Modify(true);

        AuditLog.FindLast();
        SecondEntryNo := AuditLog."Entry No.";

        Assert.IsTrue(SecondEntryNo > FirstEntryNo, 'Entry No. should auto-increment');

        // Cleanup
        AuditLog.DeleteAll(true);
        TrackedItem.Delete(true);
    end;
}
