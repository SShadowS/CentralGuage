codeunit 80001 "CG-AL-E001 Test"
{
    // Tests for CG-AL-E001: Basic Table - Product Category
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibraryRandom: Codeunit "Library - Random";

    [Test]
    procedure TestTableExists()
    var
        ProductCategory: Record "Product Category";
    begin
        // [SCENARIO] Product Category table can be instantiated
        // [GIVEN] The Product Category table exists
        // [WHEN] We initialize a record
        ProductCategory.Init();
        // [THEN] No error occurs
    end;

    [Test]
    procedure TestPrimaryKeyField()
    var
        ProductCategory: Record "Product Category";
        TestCode: Code[20];
    begin
        // [SCENARIO] Primary key field Code exists and works
        // [GIVEN] A code value
        TestCode := 'TEST001';
        // [WHEN] We assign to Code field
        ProductCategory.Code := TestCode;
        // [THEN] The value is stored correctly
        Assert.AreEqual(TestCode, ProductCategory.Code, 'Code field should store value correctly');
    end;

    [Test]
    procedure TestDescriptionField()
    var
        ProductCategory: Record "Product Category";
        TestDescription: Text[100];
    begin
        // [SCENARIO] Description field exists and accepts Text[100]
        // [GIVEN] A description value
        TestDescription := 'Test Category Description';
        // [WHEN] We assign to Description field
        ProductCategory.Description := TestDescription;
        // [THEN] The value is stored correctly
        Assert.AreEqual(TestDescription, ProductCategory.Description, 'Description field should store value correctly');
    end;

    [Test]
    procedure TestActiveField()
    var
        ProductCategory: Record "Product Category";
    begin
        // [SCENARIO] Active field exists and is Boolean
        // [GIVEN] A Product Category record
        ProductCategory.Init();
        // [WHEN] We set Active to true
        ProductCategory.Active := true;
        // [THEN] The value is stored correctly
        Assert.IsTrue(ProductCategory.Active, 'Active field should be true');
        // [WHEN] We set Active to false
        ProductCategory.Active := false;
        // [THEN] The value is stored correctly
        Assert.IsFalse(ProductCategory.Active, 'Active field should be false');
    end;

    [Test]
    procedure TestCreatedDateField()
    var
        ProductCategory: Record "Product Category";
        TestDate: Date;
    begin
        // [SCENARIO] Created Date field exists and accepts Date
        // [GIVEN] A date value
        TestDate := WorkDate();
        // [WHEN] We assign to Created Date field
        ProductCategory."Created Date" := TestDate;
        // [THEN] The value is stored correctly
        Assert.AreEqual(TestDate, ProductCategory."Created Date", 'Created Date field should store value correctly');
    end;

    [Test]
    procedure TestInsertAndGet()
    var
        ProductCategory: Record "Product Category";
        TestCode: Code[20];
    begin
        // [SCENARIO] Record can be inserted and retrieved
        // [GIVEN] A Product Category with data
        TestCode := CopyStr(LibraryRandom.RandText(10), 1, 20);
        ProductCategory.Init();
        ProductCategory.Code := TestCode;
        ProductCategory.Description := 'Test Description';
        ProductCategory.Active := true;
        ProductCategory."Created Date" := WorkDate();

        // [WHEN] We insert the record
        ProductCategory.Insert(true);

        // [THEN] We can retrieve it by primary key
        Clear(ProductCategory);
        Assert.IsTrue(ProductCategory.Get(TestCode), 'Should be able to get inserted record');
        Assert.AreEqual('Test Description', ProductCategory.Description, 'Description should match');

        // Cleanup
        ProductCategory.Delete();
    end;

    [Test]
    procedure TestActiveDefaultValue()
    var
        ProductCategory: Record "Product Category";
        TestCode: Code[20];
    begin
        // [SCENARIO] Active field defaults to true when record is inserted
        // [GIVEN] A new Product Category record with Code and Description but Active not set
        TestCode := CopyStr(LibraryRandom.RandText(10), 1, 20);
        ProductCategory.Init();
        ProductCategory.Code := TestCode;
        ProductCategory.Description := 'Test Default Active';
        ProductCategory."Created Date" := WorkDate();
        // Note: Active is NOT explicitly set - should default to true via InitValue

        // [WHEN] We insert the record
        ProductCategory.Insert(true);

        // [THEN] Active should default to true (via InitValue property)
        Clear(ProductCategory);
        ProductCategory.Get(TestCode);
        Assert.IsTrue(ProductCategory.Active, 'Active should default to true via InitValue');

        // Cleanup
        ProductCategory.Delete();
    end;
}
