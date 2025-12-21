codeunit 80022 "CG-AL-H022 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        DynamicHandler: Codeunit "CG Dynamic Record Handler";

    // ===== GetTableName Tests =====

    [Test]
    procedure TestGetTableName_ValidTable()
    var
        TableName: Text;
    begin
        // [SCENARIO] GetTableName returns correct name for valid table
        // [WHEN] Getting name for Customer table (18)
        TableName := DynamicHandler.GetTableName(Database::Customer);

        // [THEN] Returns 'Customer'
        Assert.AreEqual('Customer', TableName, 'Should return Customer table name');
    end;

    [Test]
    procedure TestGetTableName_AnotherTable()
    var
        TableName: Text;
    begin
        // [SCENARIO] GetTableName works for different tables
        // [WHEN] Getting name for Item table (27)
        TableName := DynamicHandler.GetTableName(Database::Item);

        // [THEN] Returns 'Item'
        Assert.AreEqual('Item', TableName, 'Should return Item table name');
    end;

    [Test]
    procedure TestGetTableName_InvalidTable()
    var
        TableName: Text;
    begin
        // [SCENARIO] GetTableName returns empty for invalid table ID
        // [WHEN] Getting name for non-existent table
        TableName := DynamicHandler.GetTableName(999999);

        // [THEN] Returns empty string
        Assert.AreEqual('', TableName, 'Should return empty for invalid table');
    end;

    [Test]
    procedure TestGetTableName_HelperTable()
    var
        TableName: Text;
    begin
        // [SCENARIO] GetTableName works for custom tables
        // [WHEN] Getting name for our helper table (70225)
        TableName := DynamicHandler.GetTableName(70225);

        // [THEN] Returns 'CG Test Record'
        Assert.AreEqual('CG Test Record', TableName, 'Should return helper table name');
    end;

    // ===== GetPrimaryKeyFieldCount Tests =====

    [Test]
    procedure TestGetPrimaryKeyFieldCount_SingleFieldKey()
    var
        FieldCount: Integer;
    begin
        // [SCENARIO] GetPrimaryKeyFieldCount returns 1 for single-field PK
        // [WHEN] Getting PK field count for CG Test Record (single field PK)
        FieldCount := DynamicHandler.GetPrimaryKeyFieldCount(70225);

        // [THEN] Returns 1
        Assert.AreEqual(1, FieldCount, 'CG Test Record has single field PK');
    end;

    [Test]
    procedure TestGetPrimaryKeyFieldCount_CustomerTable()
    var
        FieldCount: Integer;
    begin
        // [SCENARIO] GetPrimaryKeyFieldCount works for standard tables
        // [WHEN] Getting PK field count for Customer table
        FieldCount := DynamicHandler.GetPrimaryKeyFieldCount(Database::Customer);

        // [THEN] Returns 1 (Customer has single "No." as PK)
        Assert.AreEqual(1, FieldCount, 'Customer table has single field PK');
    end;

    [Test]
    procedure TestGetPrimaryKeyFieldCount_InvalidTable()
    var
        FieldCount: Integer;
    begin
        // [SCENARIO] GetPrimaryKeyFieldCount returns 0 for invalid table
        // [WHEN] Getting PK field count for non-existent table
        FieldCount := DynamicHandler.GetPrimaryKeyFieldCount(999999);

        // [THEN] Returns 0
        Assert.AreEqual(0, FieldCount, 'Should return 0 for invalid table');
    end;

    // ===== GetFieldValueAsText Tests =====

    [Test]
    procedure TestGetFieldValueAsText_ExistingField()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        Value: Text;
    begin
        // [SCENARIO] GetFieldValueAsText returns field value as text
        // [GIVEN] A record with data
        TestRecord.Code := 'TEST001';
        TestRecord.Description := 'Test Description';
        TestRecord.Amount := 123.45;
        TestRecord.Insert();

        RecRef.GetTable(TestRecord);

        // [WHEN] Getting Description field (field 2)
        Value := DynamicHandler.GetFieldValueAsText(RecRef, 2);

        // [THEN] Returns the description
        Assert.AreEqual('Test Description', Value, 'Should return description');

        RecRef.Close();

        // Cleanup
        TestRecord.Delete();
    end;

    [Test]
    procedure TestGetFieldValueAsText_DecimalField()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        Value: Text;
    begin
        // [SCENARIO] GetFieldValueAsText converts decimal to text
        // [GIVEN] A record with amount
        TestRecord.Code := 'TEST002';
        TestRecord.Amount := 999.99;
        TestRecord.Insert();

        RecRef.GetTable(TestRecord);

        // [WHEN] Getting Amount field (field 3)
        Value := DynamicHandler.GetFieldValueAsText(RecRef, 3);

        // [THEN] Returns amount as text
        Assert.IsTrue(Value.Contains('999'), 'Should contain 999');

        RecRef.Close();

        // Cleanup
        TestRecord.Delete();
    end;

    [Test]
    procedure TestGetFieldValueAsText_NonExistentField()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        Value: Text;
    begin
        // [SCENARIO] GetFieldValueAsText returns empty for non-existent field
        // [GIVEN] A record
        TestRecord.Code := 'TEST003';
        TestRecord.Insert();

        RecRef.GetTable(TestRecord);

        // [WHEN] Getting non-existent field (field 999)
        Value := DynamicHandler.GetFieldValueAsText(RecRef, 999);

        // [THEN] Returns empty string
        Assert.AreEqual('', Value, 'Should return empty for non-existent field');

        RecRef.Close();

        // Cleanup
        TestRecord.Delete();
    end;

    // ===== SetFieldValue Tests =====

    [Test]
    procedure TestSetFieldValue_ValidField()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        Success: Boolean;
        NewDesc: Text[100];
    begin
        // [SCENARIO] SetFieldValue sets field value successfully
        // [GIVEN] A record
        TestRecord.Code := 'TEST004';
        TestRecord.Description := 'Original';
        TestRecord.Insert();

        RecRef.GetTable(TestRecord);

        // [WHEN] Setting Description field (field 2)
        NewDesc := 'Updated Description';
        Success := DynamicHandler.SetFieldValue(RecRef, 2, NewDesc);

        // [THEN] Returns true and value is updated
        Assert.IsTrue(Success, 'Should return true');
        Assert.AreEqual('Updated Description', DynamicHandler.GetFieldValueAsText(RecRef, 2), 'Value should be updated');

        RecRef.Close();

        // Cleanup
        TestRecord.Delete();
    end;

    [Test]
    procedure TestSetFieldValue_NonExistentField()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        Success: Boolean;
    begin
        // [SCENARIO] SetFieldValue returns false for non-existent field
        // [GIVEN] A record
        TestRecord.Code := 'TEST005';
        TestRecord.Insert();

        RecRef.GetTable(TestRecord);

        // [WHEN] Setting non-existent field (field 999)
        Success := DynamicHandler.SetFieldValue(RecRef, 999, 'Value');

        // [THEN] Returns false
        Assert.IsFalse(Success, 'Should return false for non-existent field');

        RecRef.Close();

        // Cleanup
        TestRecord.Delete();
    end;

    // ===== CopyMatchingFields Tests =====

    [Test]
    procedure TestCopyMatchingFields_MatchingFields()
    var
        SourceRecord: Record "CG Test Record";
        DestRecord: Record "CG Test Record";
        SourceRef: RecordRef;
        DestRef: RecordRef;
        CopiedCount: Integer;
    begin
        // [SCENARIO] CopyMatchingFields copies fields with same name
        // [GIVEN] Two records of same table type
        SourceRecord.Code := 'SRC001';
        SourceRecord.Description := 'Source Description';
        SourceRecord.Amount := 500;
        SourceRecord.Active := true;

        DestRecord.Code := 'DST001';
        DestRecord.Description := '';
        DestRecord.Amount := 0;

        SourceRef.GetTable(SourceRecord);
        DestRef.GetTable(DestRecord);

        // [WHEN] Copying matching fields
        CopiedCount := DynamicHandler.CopyMatchingFields(SourceRef, DestRef);

        // [THEN] Fields are copied
        Assert.IsTrue(CopiedCount > 0, 'Should copy at least some fields');
        Assert.AreEqual('Source Description', DynamicHandler.GetFieldValueAsText(DestRef, 2), 'Description should be copied');

        SourceRef.Close();
        DestRef.Close();
    end;

    [Test]
    procedure TestCopyMatchingFields_DifferentTables()
    var
        Customer: Record Customer;
        TestRecord: Record "CG Test Record";
        SourceRef: RecordRef;
        DestRef: RecordRef;
        CopiedCount: Integer;
    begin
        // [SCENARIO] CopyMatchingFields works between different tables
        // [GIVEN] Records from different tables
        Customer."No." := 'CUST001';
        Customer.Name := 'Test Customer';

        TestRecord.Code := 'TEST006';

        SourceRef.GetTable(Customer);
        DestRef.GetTable(TestRecord);

        // [WHEN] Copying matching fields
        CopiedCount := DynamicHandler.CopyMatchingFields(SourceRef, DestRef);

        // [THEN] Returns count (may be 0 if no matching field names)
        Assert.IsTrue(CopiedCount >= 0, 'Should return valid count');

        SourceRef.Close();
        DestRef.Close();
    end;

    // ===== GetFilterString Tests =====

    [Test]
    procedure TestGetFilterString_WithFilter()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        FilterStr: Text;
    begin
        // [SCENARIO] GetFilterString returns current filters
        // [GIVEN] A record variable with filters set
        TestRecord.SetRange(Code, 'A', 'Z');
        RecRef.GetTable(TestRecord);

        // [WHEN] Getting filter string
        FilterStr := DynamicHandler.GetFilterString(RecRef);

        // [THEN] Filter string contains filter info
        Assert.IsTrue(FilterStr <> '', 'Should have filter string');

        RecRef.Close();
    end;

    [Test]
    procedure TestGetFilterString_NoFilter()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        FilterStr: Text;
    begin
        // [SCENARIO] GetFilterString returns empty when no filters
        // [GIVEN] A record variable without filters
        TestRecord.Reset();
        RecRef.GetTable(TestRecord);

        // [WHEN] Getting filter string
        FilterStr := DynamicHandler.GetFilterString(RecRef);

        // [THEN] Filter string is empty
        Assert.AreEqual('', FilterStr, 'Should be empty without filters');

        RecRef.Close();
    end;

    // ===== ApplyFilterString Tests =====

    [Test]
    procedure TestApplyFilterString_ValidFilter()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        Success: Boolean;
        FilterStr: Text;
    begin
        // [SCENARIO] ApplyFilterString applies valid filter
        // [GIVEN] A record ref
        RecRef.Open(70225);
        FilterStr := 'WHERE(Code=FILTER(TEST*))';

        // [WHEN] Applying filter
        Success := DynamicHandler.ApplyFilterString(RecRef, FilterStr);

        // [THEN] Returns true
        Assert.IsTrue(Success, 'Should return true for valid filter');

        RecRef.Close();
    end;

    // ===== GetRelatedTableId Tests =====

    [Test]
    procedure TestGetRelatedTableId_WithRelation()
    var
        RelatedTableId: Integer;
    begin
        // [SCENARIO] GetRelatedTableId returns related table for field with TableRelation
        // [WHEN] Getting relation for "Customer No." field (field 5) in CG Test Record
        RelatedTableId := DynamicHandler.GetRelatedTableId(70225, 5);

        // [THEN] Returns Customer table ID (18)
        Assert.AreEqual(Database::Customer, RelatedTableId, 'Should return Customer table ID');
    end;

    [Test]
    procedure TestGetRelatedTableId_NoRelation()
    var
        RelatedTableId: Integer;
    begin
        // [SCENARIO] GetRelatedTableId returns 0 for field without relation
        // [WHEN] Getting relation for "Description" field (field 2) in CG Test Record
        RelatedTableId := DynamicHandler.GetRelatedTableId(70225, 2);

        // [THEN] Returns 0
        Assert.AreEqual(0, RelatedTableId, 'Should return 0 for field without relation');
    end;

    [Test]
    procedure TestGetRelatedTableId_InvalidField()
    var
        RelatedTableId: Integer;
    begin
        // [SCENARIO] GetRelatedTableId returns 0 for non-existent field
        // [WHEN] Getting relation for non-existent field
        RelatedTableId := DynamicHandler.GetRelatedTableId(70225, 999);

        // [THEN] Returns 0
        Assert.AreEqual(0, RelatedTableId, 'Should return 0 for non-existent field');
    end;

    [Test]
    procedure TestGetRelatedTableId_InvalidTable()
    var
        RelatedTableId: Integer;
    begin
        // [SCENARIO] GetRelatedTableId returns 0 for invalid table
        // [WHEN] Getting relation for non-existent table
        RelatedTableId := DynamicHandler.GetRelatedTableId(999999, 1);

        // [THEN] Returns 0
        Assert.AreEqual(0, RelatedTableId, 'Should return 0 for invalid table');
    end;
}
