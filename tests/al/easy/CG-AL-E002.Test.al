codeunit 80002 "CG-AL-E002 Test"
{
    // Tests for CG-AL-E002: Basic Page - Product Category Card
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibraryRandom: Codeunit "Library - Random";

    [Test]
    procedure TestPageOpens()
    var
        ProductCategory: Record "Product Category";
        ProductCategoryCard: TestPage "Product Category Card";
    begin
        // [SCENARIO] Product Category Card page can be opened
        // [GIVEN] A Product Category record
        CreateProductCategory(ProductCategory);

        // [WHEN] We open the page
        ProductCategoryCard.OpenView();
        ProductCategoryCard.GoToRecord(ProductCategory);

        // [THEN] The page opens without error
        ProductCategoryCard.Close();

        // Cleanup
        ProductCategory.Delete();
    end;

    [Test]
    procedure TestPageFieldsExist()
    var
        ProductCategory: Record "Product Category";
        ProductCategoryCard: TestPage "Product Category Card";
    begin
        // [SCENARIO] All expected fields are visible on the page
        // [GIVEN] A Product Category record
        CreateProductCategory(ProductCategory);

        // [WHEN] We open the page
        ProductCategoryCard.OpenView();
        ProductCategoryCard.GoToRecord(ProductCategory);

        // [THEN] All fields are accessible
        Assert.AreEqual(ProductCategory.Code, ProductCategoryCard.Code.Value, 'Code field should be visible');
        Assert.AreEqual(ProductCategory.Description, ProductCategoryCard.Description.Value, 'Description field should be visible');

        ProductCategoryCard.Close();

        // Cleanup
        ProductCategory.Delete();
    end;

    [Test]
    procedure TestPageIsEditable()
    var
        ProductCategory: Record "Product Category";
        ProductCategoryCard: TestPage "Product Category Card";
        NewDescription: Text[100];
    begin
        // [SCENARIO] Fields can be edited on the page
        // [GIVEN] A Product Category record
        CreateProductCategory(ProductCategory);
        NewDescription := 'Updated Description';

        // [WHEN] We edit the Description field
        ProductCategoryCard.OpenEdit();
        ProductCategoryCard.GoToRecord(ProductCategory);
        ProductCategoryCard.Description.SetValue(NewDescription);
        ProductCategoryCard.Close();

        // [THEN] The change is saved
        ProductCategory.Get(ProductCategory.Code);
        Assert.AreEqual(NewDescription, ProductCategory.Description, 'Description should be updated');

        // Cleanup
        ProductCategory.Delete();
    end;

    [Test]
    procedure TestNewRecordFromPage()
    var
        ProductCategory: Record "Product Category";
        ProductCategoryCard: TestPage "Product Category Card";
        TestCode: Code[20];
    begin
        // [SCENARIO] New record can be created from page
        // [GIVEN] A new code
        TestCode := CopyStr(LibraryRandom.RandText(10), 1, 20);

        // [WHEN] We create a new record via the page
        ProductCategoryCard.OpenNew();
        ProductCategoryCard.Code.SetValue(TestCode);
        ProductCategoryCard.Description.SetValue('New Category');
        ProductCategoryCard.Close();

        // [THEN] The record exists
        Assert.IsTrue(ProductCategory.Get(TestCode), 'Record should be created');

        // Cleanup
        ProductCategory.Delete();
    end;

    local procedure CreateProductCategory(var ProductCategory: Record "Product Category")
    begin
        ProductCategory.Init();
        ProductCategory.Code := CopyStr(LibraryRandom.RandText(10), 1, 20);
        ProductCategory.Description := 'Test Category';
        ProductCategory.Active := true;
        ProductCategory."Created Date" := WorkDate();
        ProductCategory.Insert(true);
    end;
}
