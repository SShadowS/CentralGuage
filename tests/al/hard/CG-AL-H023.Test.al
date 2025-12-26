codeunit 80025 "CG-AL-H023 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        Introspector: Codeunit "CG Record Introspector";

    // ========== SerializeToJson Tests ==========

    [Test]
    procedure TestSerializeToJson_BasicRecord()
    var
        TestRecord: Record "CG Test Record";
        JsonResult: JsonObject;
        JsonToken: JsonToken;
        TextValue: Text;
    begin
        // [SCENARIO] SerializeToJson converts a record to JSON
        // [GIVEN] A test record with data
        TestRecord.Code := 'SER001';
        TestRecord.Description := 'Serialization Test';
        TestRecord.Amount := 123.45;
        TestRecord.Active := true;

        // [WHEN] Serializing to JSON
        JsonResult := Introspector.SerializeToJson(TestRecord);

        // [THEN] JSON contains the field values
        Assert.IsTrue(JsonResult.Get('Code', JsonToken), 'Should have Code field');
        TextValue := JsonToken.AsValue().AsText();
        Assert.AreEqual('SER001', TextValue, 'Code should match');

        Assert.IsTrue(JsonResult.Get('Description', JsonToken), 'Should have Description field');
        TextValue := JsonToken.AsValue().AsText();
        Assert.AreEqual('Serialization Test', TextValue, 'Description should match');

        Assert.IsTrue(JsonResult.Get('Amount', JsonToken), 'Should have Amount field');
        Assert.AreEqual(123.45, JsonToken.AsValue().AsDecimal(), 'Amount should match');

        Assert.IsTrue(JsonResult.Get('Active', JsonToken), 'Should have Active field');
        Assert.IsTrue(JsonToken.AsValue().AsBoolean(), 'Active should be true');
    end;

    [Test]
    procedure TestSerializeToJson_HasMetadata()
    var
        TestRecord: Record "CG Test Record";
        JsonResult: JsonObject;
        MetadataToken: JsonToken;
        MetadataObj: JsonObject;
        JsonToken: JsonToken;
    begin
        // [SCENARIO] SerializeToJson includes _metadata
        // [GIVEN] A test record
        TestRecord.Code := 'META01';
        TestRecord.Insert();

        // [WHEN] Serializing to JSON
        JsonResult := Introspector.SerializeToJson(TestRecord);

        // [THEN] JSON contains _metadata with table info
        Assert.IsTrue(JsonResult.Get('_metadata', MetadataToken), 'Should have _metadata');
        MetadataObj := MetadataToken.AsObject();

        Assert.IsTrue(MetadataObj.Get('TableName', JsonToken), 'Should have TableName');
        Assert.AreEqual('CG Test Record', JsonToken.AsValue().AsText(), 'TableName should match');

        Assert.IsTrue(MetadataObj.Get('TableId', JsonToken), 'Should have TableId');
        Assert.AreEqual(69225, JsonToken.AsValue().AsInteger(), 'TableId should be 69225');

        // Cleanup
        TestRecord.Delete();
    end;

    [Test]
    procedure TestSerializeToJson_DifferentTableType()
    var
        Customer: Record Customer;
        JsonResult: JsonObject;
        JsonToken: JsonToken;
    begin
        // [SCENARIO] SerializeToJson works with standard BC tables
        // [GIVEN] A customer record
        Customer."No." := 'CUST-JSON';
        Customer.Name := 'JSON Test Customer';

        // [WHEN] Serializing to JSON
        JsonResult := Introspector.SerializeToJson(Customer);

        // [THEN] JSON contains customer fields
        Assert.IsTrue(JsonResult.Get('No.', JsonToken) or JsonResult.Get('No', JsonToken), 'Should have No. field');
        Assert.IsTrue(JsonResult.Get('Name', JsonToken), 'Should have Name field');
    end;

    // ========== DeserializeFromJson Tests ==========

    [Test]
    procedure TestDeserializeFromJson_ValidData()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        JsonData: JsonObject;
        MetadataObj: JsonObject;
        Success: Boolean;
    begin
        // [SCENARIO] DeserializeFromJson populates RecordRef from JSON
        // [GIVEN] JSON with valid data and metadata
        MetadataObj.Add('TableId', 69225);
        MetadataObj.Add('TableName', 'CG Test Record');
        JsonData.Add('_metadata', MetadataObj);
        JsonData.Add('Code', 'DES001');
        JsonData.Add('Description', 'Deserialized Record');
        JsonData.Add('Amount', 999.99);
        JsonData.Add('Active', false);

        RecRef.Open(69225);

        // [WHEN] Deserializing
        Success := Introspector.DeserializeFromJson(JsonData, RecRef);

        // [THEN] RecordRef is populated
        Assert.IsTrue(Success, 'Should return true');
        Assert.AreEqual('DES001', GetFieldValueAsText(RecRef, 1), 'Code should be set');
        Assert.AreEqual('Deserialized Record', GetFieldValueAsText(RecRef, 2), 'Description should be set');

        RecRef.Close();
    end;

    [Test]
    procedure TestDeserializeFromJson_TableMismatch()
    var
        RecRef: RecordRef;
        JsonData: JsonObject;
        MetadataObj: JsonObject;
        Success: Boolean;
    begin
        // [SCENARIO] DeserializeFromJson rejects mismatched table
        // [GIVEN] JSON with different table ID
        MetadataObj.Add('TableId', 18); // Customer table ID
        JsonData.Add('_metadata', MetadataObj);
        JsonData.Add('Code', 'TEST');

        RecRef.Open(69225); // CG Test Record

        // [WHEN] Deserializing
        Success := Introspector.DeserializeFromJson(JsonData, RecRef);

        // [THEN] Returns false due to mismatch
        Assert.IsFalse(Success, 'Should return false for table mismatch');

        RecRef.Close();
    end;

    // ========== CompareRecords Tests ==========

    [Test]
    procedure TestCompareRecords_NoDifferences()
    var
        Record1: Record "CG Test Record";
        Record2: Record "CG Test Record";
        Differences: Dictionary of [Text, Text];
    begin
        // [SCENARIO] CompareRecords returns empty when records are identical
        // [GIVEN] Two identical records
        Record1.Code := 'CMP001';
        Record1.Description := 'Same';
        Record1.Amount := 100;

        Record2.Code := 'CMP001';
        Record2.Description := 'Same';
        Record2.Amount := 100;

        // [WHEN] Comparing
        Differences := Introspector.CompareRecords(Record1, Record2);

        // [THEN] No differences
        Assert.AreEqual(0, Differences.Count, 'Should have no differences');
    end;

    [Test]
    procedure TestCompareRecords_WithDifferences()
    var
        Record1: Record "CG Test Record";
        Record2: Record "CG Test Record";
        Differences: Dictionary of [Text, Text];
        DiffValue: Text;
    begin
        // [SCENARIO] CompareRecords detects field differences
        // [GIVEN] Two records with differences
        Record1.Code := 'CMP002';
        Record1.Description := 'Original';
        Record1.Amount := 100;

        Record2.Code := 'CMP002';
        Record2.Description := 'Modified';
        Record2.Amount := 200;

        // [WHEN] Comparing
        Differences := Introspector.CompareRecords(Record1, Record2);

        // [THEN] Differences detected
        Assert.IsTrue(Differences.Count >= 2, 'Should have at least 2 differences');
        Assert.IsTrue(Differences.ContainsKey('Description'), 'Should detect Description change');
        Assert.IsTrue(Differences.ContainsKey('Amount'), 'Should detect Amount change');

        Differences.Get('Description', DiffValue);
        Assert.IsTrue(DiffValue.Contains('Original'), 'Should contain old value');
        Assert.IsTrue(DiffValue.Contains('Modified'), 'Should contain new value');
    end;

    [Test]
    procedure TestCompareRecords_DifferentTables()
    var
        TestRecord: Record "CG Test Record";
        Customer: Record Customer;
        Differences: Dictionary of [Text, Text];
    begin
        // [SCENARIO] CompareRecords returns empty for different table types
        // [GIVEN] Records from different tables
        TestRecord.Code := 'TEST';
        Customer."No." := 'CUST';

        // [WHEN] Comparing
        Differences := Introspector.CompareRecords(TestRecord, Customer);

        // [THEN] Returns empty (different tables)
        Assert.AreEqual(0, Differences.Count, 'Should be empty for different tables');
    end;

    // ========== CloneRecord Tests ==========

    [Test]
    procedure TestCloneRecord_AllFields()
    var
        SourceRecord: Record "CG Test Record";
        DestRecRef: RecordRef;
        Success: Boolean;
    begin
        // [SCENARIO] CloneRecord copies all normal fields
        // [GIVEN] A source record
        SourceRecord.Code := 'CLONE1';
        SourceRecord.Description := 'Clone Source';
        SourceRecord.Amount := 555.55;
        SourceRecord.Active := true;
        SourceRecord."Customer No." := '';

        DestRecRef.Open(69225);

        // [WHEN] Cloning
        Success := Introspector.CloneRecord(SourceRecord, DestRecRef);

        // [THEN] Fields are copied
        Assert.IsTrue(Success, 'Should return true');
        Assert.AreEqual('CLONE1', GetFieldValueAsText(DestRecRef, 1), 'Code should be cloned');
        Assert.AreEqual('Clone Source', GetFieldValueAsText(DestRecRef, 2), 'Description should be cloned');

        DestRecRef.Close();
    end;

    [Test]
    procedure TestCloneRecord_PreservesExistingPK()
    var
        SourceRecord: Record "CG Test Record";
        DestRecord: Record "CG Test Record";
        DestRecRef: RecordRef;
        Success: Boolean;
    begin
        // [SCENARIO] CloneRecord preserves existing primary key on destination
        // [GIVEN] Source and dest with different PKs
        SourceRecord.Code := 'SRC-PK';
        SourceRecord.Description := 'Source Data';

        DestRecord.Code := 'DST-PK'; // Pre-set PK
        DestRecRef.GetTable(DestRecord);

        // [WHEN] Cloning
        Success := Introspector.CloneRecord(SourceRecord, DestRecRef);

        // [THEN] Dest PK preserved, other fields copied
        Assert.IsTrue(Success, 'Should return true');
        Assert.AreEqual('DST-PK', GetFieldValueAsText(DestRecRef, 1), 'PK should be preserved');
        Assert.AreEqual('Source Data', GetFieldValueAsText(DestRecRef, 2), 'Description should be copied');

        DestRecRef.Close();
    end;

    // ========== GetTableSchema Tests ==========

    [Test]
    procedure TestGetTableSchema_ReturnsAllFields()
    var
        Schema: JsonArray;
        FieldInfo: JsonToken;
        FieldObj: JsonObject;
        FieldNo: Integer;
        i: Integer;
    begin
        // [SCENARIO] GetTableSchema returns complete field info
        // [WHEN] Getting schema for CG Test Record
        Schema := Introspector.GetTableSchema(69225);

        // [THEN] Returns array with field info
        Assert.IsTrue(Schema.Count >= 5, 'Should have at least 5 fields');

        // Check first field
        Schema.Get(0, FieldInfo);
        FieldObj := FieldInfo.AsObject();

        Assert.IsTrue(FieldObj.Contains('FieldNo'), 'Should have FieldNo');
        Assert.IsTrue(FieldObj.Contains('FieldName'), 'Should have FieldName');
        Assert.IsTrue(FieldObj.Contains('FieldType'), 'Should have FieldType');
        Assert.IsTrue(FieldObj.Contains('FieldClass'), 'Should have FieldClass');
        Assert.IsTrue(FieldObj.Contains('IsPartOfPrimaryKey'), 'Should have IsPartOfPrimaryKey');
    end;

    [Test]
    procedure TestGetTableSchema_IdentifiesPrimaryKey()
    var
        Schema: JsonArray;
        FieldInfo: JsonToken;
        FieldObj: JsonObject;
        JsonToken: JsonToken;
        i: Integer;
        FoundPKField: Boolean;
    begin
        // [SCENARIO] GetTableSchema correctly identifies primary key fields
        // [WHEN] Getting schema for CG Test Record
        Schema := Introspector.GetTableSchema(69225);

        // [THEN] Code field (field 1) should be marked as PK
        FoundPKField := false;
        for i := 0 to Schema.Count - 1 do begin
            Schema.Get(i, FieldInfo);
            FieldObj := FieldInfo.AsObject();
            FieldObj.Get('FieldName', JsonToken);
            if JsonToken.AsValue().AsText() = 'Code' then begin
                FieldObj.Get('IsPartOfPrimaryKey', JsonToken);
                FoundPKField := JsonToken.AsValue().AsBoolean();
            end;
        end;

        Assert.IsTrue(FoundPKField, 'Code field should be marked as primary key');
    end;

    [Test]
    procedure TestGetTableSchema_IncludesRelation()
    var
        Schema: JsonArray;
        FieldInfo: JsonToken;
        FieldObj: JsonObject;
        JsonToken: JsonToken;
        i: Integer;
        FoundRelation: Boolean;
    begin
        // [SCENARIO] GetTableSchema includes table relation info
        // [WHEN] Getting schema for CG Test Record
        Schema := Introspector.GetTableSchema(69225);

        // [THEN] Customer No. field should have relation to Customer table
        FoundRelation := false;
        for i := 0 to Schema.Count - 1 do begin
            Schema.Get(i, FieldInfo);
            FieldObj := FieldInfo.AsObject();
            FieldObj.Get('FieldName', JsonToken);
            if JsonToken.AsValue().AsText() = 'Customer No.' then begin
                FieldObj.Get('RelatedTable', JsonToken);
                FoundRelation := (JsonToken.AsValue().AsInteger() = Database::Customer);
            end;
        end;

        Assert.IsTrue(FoundRelation, 'Customer No. should have relation to Customer table');
    end;

    // ========== BuildDynamicFilter Tests ==========

    [Test]
    procedure TestBuildDynamicFilter_SingleFilter()
    var
        RecRef: RecordRef;
        FilterCriteria: Dictionary of [Text, Text];
        Success: Boolean;
        FilterStr: Text;
    begin
        // [SCENARIO] BuildDynamicFilter applies filter by field name
        // [GIVEN] Filter criteria
        FilterCriteria.Add('Code', 'TEST*');
        RecRef.Open(69225);

        // [WHEN] Building filter
        Success := Introspector.BuildDynamicFilter(RecRef, FilterCriteria);

        // [THEN] Filter is applied
        Assert.IsTrue(Success, 'Should return true');
        FilterStr := RecRef.GetFilters();
        Assert.IsTrue(FilterStr.Contains('TEST'), 'Filter should contain TEST pattern');

        RecRef.Close();
    end;

    [Test]
    procedure TestBuildDynamicFilter_MultipleFilters()
    var
        RecRef: RecordRef;
        FilterCriteria: Dictionary of [Text, Text];
        Success: Boolean;
    begin
        // [SCENARIO] BuildDynamicFilter applies multiple filters
        // [GIVEN] Multiple filter criteria
        FilterCriteria.Add('Code', 'A*');
        FilterCriteria.Add('Active', 'true');
        RecRef.Open(69225);

        // [WHEN] Building filter
        Success := Introspector.BuildDynamicFilter(RecRef, FilterCriteria);

        // [THEN] All filters applied
        Assert.IsTrue(Success, 'Should return true');

        RecRef.Close();
    end;

    [Test]
    procedure TestBuildDynamicFilter_InvalidFieldName()
    var
        RecRef: RecordRef;
        FilterCriteria: Dictionary of [Text, Text];
        Success: Boolean;
    begin
        // [SCENARIO] BuildDynamicFilter returns false for invalid field
        // [GIVEN] Filter with non-existent field
        FilterCriteria.Add('NonExistentField', 'Value');
        RecRef.Open(69225);

        // [WHEN] Building filter
        Success := Introspector.BuildDynamicFilter(RecRef, FilterCriteria);

        // [THEN] Returns false
        Assert.IsFalse(Success, 'Should return false for invalid field');

        RecRef.Close();
    end;

    // ========== GetRecordByPrimaryKey Tests ==========

    [Test]
    procedure TestGetRecordByPrimaryKey_Found()
    var
        TestRecord: Record "CG Test Record";
        ResultRecRef: RecordRef;
        KeyValues: List of [Text];
        Found: Boolean;
    begin
        // [SCENARIO] GetRecordByPrimaryKey finds record by PK values
        // [GIVEN] A record exists
        TestRecord.Code := 'FIND001';
        TestRecord.Description := 'Find Me';
        TestRecord.Insert();

        KeyValues.Add('FIND001');

        // [WHEN] Looking up by PK
        Found := Introspector.GetRecordByPrimaryKey(69225, KeyValues, ResultRecRef);

        // [THEN] Record is found
        Assert.IsTrue(Found, 'Should find the record');
        Assert.AreEqual('Find Me', GetFieldValueAsText(ResultRecRef, 2), 'Should get correct record');

        ResultRecRef.Close();

        // Cleanup
        TestRecord.Delete();
    end;

    [Test]
    procedure TestGetRecordByPrimaryKey_NotFound()
    var
        ResultRecRef: RecordRef;
        KeyValues: List of [Text];
        Found: Boolean;
    begin
        // [SCENARIO] GetRecordByPrimaryKey returns false when not found
        // [GIVEN] Non-existent key
        KeyValues.Add('NONEXISTENT999');

        // [WHEN] Looking up
        Found := Introspector.GetRecordByPrimaryKey(69225, KeyValues, ResultRecRef);

        // [THEN] Not found
        Assert.IsFalse(Found, 'Should not find non-existent record');
    end;

    // ========== TransformRecord Tests ==========

    [Test]
    procedure TestTransformRecord_UppercaseText()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        MockTransformer: Codeunit "CG-AL-H023 Mock Transformer";
        TransformedCount: Integer;
    begin
        // [SCENARIO] TransformRecord applies transformations to fields
        // [GIVEN] A record with lowercase text
        TestRecord.Code := 'trans1';
        TestRecord.Description := 'lowercase text';
        RecRef.GetTable(TestRecord);

        MockTransformer.SetUppercaseTextFields(true);

        // [WHEN] Transforming
        TransformedCount := Introspector.TransformRecord(RecRef, MockTransformer);

        // [THEN] Text fields are uppercased
        Assert.IsTrue(TransformedCount > 0, 'Should transform at least one field');
        Assert.AreEqual('TRANS1', GetFieldValueAsText(RecRef, 1), 'Code should be uppercase');
        Assert.AreEqual('LOWERCASE TEXT', GetFieldValueAsText(RecRef, 2), 'Description should be uppercase');

        RecRef.Close();
    end;

    [Test]
    procedure TestTransformRecord_MultiplyDecimals()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        MockTransformer: Codeunit "CG-AL-H023 Mock Transformer";
        TransformedCount: Integer;
        ResultValue: Text;
    begin
        // [SCENARIO] TransformRecord can multiply decimal fields
        // [GIVEN] A record with amount
        TestRecord.Code := 'MULT01';
        TestRecord.Amount := 100;
        RecRef.GetTable(TestRecord);

        MockTransformer.SetMultiplyDecimals(true, 1.5);

        // [WHEN] Transforming
        TransformedCount := Introspector.TransformRecord(RecRef, MockTransformer);

        // [THEN] Amount is multiplied
        Assert.IsTrue(TransformedCount >= 1, 'Should transform at least one field');
        ResultValue := GetFieldValueAsText(RecRef, 3);
        Assert.IsTrue(ResultValue.Contains('150'), 'Amount should be 150');

        RecRef.Close();
    end;

    // ========== FindRelatedRecords Tests ==========

    [Test]
    procedure TestFindRelatedRecords_FindsChildren()
    var
        ParentRecord: Record "CG Test Record";
        ChildRecord1: Record "CG Related Record";
        ChildRecord2: Record "CG Related Record";
        ParentRecRef: RecordRef;
        RelatedIds: List of [RecordId];
    begin
        // [SCENARIO] FindRelatedRecords finds records referencing source
        // [GIVEN] A parent with related child records
        ParentRecord.Code := 'PARENT1';
        ParentRecord.Insert();

        ChildRecord1."Parent Code" := 'PARENT1';
        ChildRecord1."Line Description" := 'Child 1';
        ChildRecord1.Insert();

        ChildRecord2."Parent Code" := 'PARENT1';
        ChildRecord2."Line Description" := 'Child 2';
        ChildRecord2.Insert();

        ParentRecRef.GetTable(ParentRecord);

        // [WHEN] Finding related records
        RelatedIds := Introspector.FindRelatedRecords(ParentRecRef, 69228); // CG Related Record table

        // [THEN] Both children found
        Assert.AreEqual(2, RelatedIds.Count, 'Should find 2 related records');

        ParentRecRef.Close();

        // Cleanup
        ChildRecord1.Delete();
        ChildRecord2.Delete();
        ParentRecord.Delete();
    end;

    [Test]
    procedure TestFindRelatedRecords_NoRelated()
    var
        ParentRecord: Record "CG Test Record";
        ParentRecRef: RecordRef;
        RelatedIds: List of [RecordId];
    begin
        // [SCENARIO] FindRelatedRecords returns empty when no children
        // [GIVEN] A parent with no children
        ParentRecord.Code := 'LONELY1';
        ParentRecord.Insert();

        ParentRecRef.GetTable(ParentRecord);

        // [WHEN] Finding related records
        RelatedIds := Introspector.FindRelatedRecords(ParentRecRef, 69228);

        // [THEN] Empty list
        Assert.AreEqual(0, RelatedIds.Count, 'Should find no related records');

        ParentRecRef.Close();

        // Cleanup
        ParentRecord.Delete();
    end;

    // ========== ValidateRecordCompleteness Tests ==========

    [Test]
    procedure TestValidateRecordCompleteness_AllComplete()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        RequiredFields: List of [Integer];
        MissingFields: List of [Text];
    begin
        // [SCENARIO] ValidateRecordCompleteness returns empty when all required fields have values
        // [GIVEN] A complete record
        TestRecord.Code := 'VALID01';
        TestRecord.Description := 'Has Description';
        TestRecord.Amount := 100;
        RecRef.GetTable(TestRecord);

        RequiredFields.Add(1); // Code
        RequiredFields.Add(2); // Description
        RequiredFields.Add(3); // Amount

        // [WHEN] Validating
        MissingFields := Introspector.ValidateRecordCompleteness(RecRef, RequiredFields);

        // [THEN] No missing fields
        Assert.AreEqual(0, MissingFields.Count, 'Should have no missing fields');

        RecRef.Close();
    end;

    [Test]
    procedure TestValidateRecordCompleteness_MissingFields()
    var
        TestRecord: Record "CG Test Record";
        RecRef: RecordRef;
        RequiredFields: List of [Integer];
        MissingFields: List of [Text];
    begin
        // [SCENARIO] ValidateRecordCompleteness identifies empty required fields
        // [GIVEN] A record with empty required fields
        TestRecord.Code := 'INVAL01';
        TestRecord.Description := ''; // Empty
        TestRecord.Amount := 0; // Zero
        RecRef.GetTable(TestRecord);

        RequiredFields.Add(2); // Description
        RequiredFields.Add(3); // Amount

        // [WHEN] Validating
        MissingFields := Introspector.ValidateRecordCompleteness(RecRef, RequiredFields);

        // [THEN] Missing fields identified
        Assert.IsTrue(MissingFields.Count >= 1, 'Should identify at least Description as missing');
        Assert.IsTrue(MissingFields.Contains('Description'), 'Description should be in missing list');

        RecRef.Close();
    end;

    [Test]
    procedure TestValidateRecordCompleteness_DateField()
    var
        RelatedRecord: Record "CG Related Record";
        RecRef: RecordRef;
        RequiredFields: List of [Integer];
        MissingFields: List of [Text];
    begin
        // [SCENARIO] ValidateRecordCompleteness checks date fields for 0D
        // [GIVEN] A record with empty date
        RelatedRecord."Entry No." := 99999;
        RelatedRecord."Created Date" := 0D; // Empty date
        RecRef.GetTable(RelatedRecord);

        RequiredFields.Add(5); // Created Date

        // [WHEN] Validating
        MissingFields := Introspector.ValidateRecordCompleteness(RecRef, RequiredFields);

        // [THEN] Date field identified as missing
        Assert.IsTrue(MissingFields.Contains('Created Date'), 'Empty date should be missing');

        RecRef.Close();
    end;

    // ========== Helper Procedure for Tests ==========
    local procedure GetFieldValueAsText(var RecRef: RecordRef; FieldNo: Integer): Text
    var
        FRef: FieldRef;
    begin
        if not RecRef.FieldExist(FieldNo) then
            exit('');
        FRef := RecRef.Field(FieldNo);
        exit(Format(FRef.Value));
    end;
}
