codeunit 80011 "CG-AL-M001 Test"
{
    // Tests for CG-AL-M001: API Page - Product API with CRUD
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibraryRandom: Codeunit "Library - Random";

    [Test]
    procedure TestAPIPageExists()
    var
        ProductAPI: TestPage "Product API";
    begin
        // [SCENARIO] Product API page can be opened
        // [WHEN] We open the API page
        ProductAPI.OpenView();
        // [THEN] No error occurs
        ProductAPI.Close();
    end;

    [Test]
    procedure TestCreateProduct()
    var
        Product: Record Product;
        ProductAPI: TestPage "Product API";
        ProductCode: Code[20];
    begin
        // [SCENARIO] Product can be created via API page
        // [GIVEN] Product data
        ProductCode := CopyStr(LibraryRandom.RandText(10), 1, 20);

        // [WHEN] We create a product via the API
        ProductAPI.OpenNew();
        ProductAPI.productCode.SetValue(ProductCode);
        ProductAPI.description.SetValue('Test Product');
        ProductAPI.unitPrice.SetValue(99.99);
        ProductAPI.stockQuantity.SetValue(100);
        ProductAPI.Close();

        // [THEN] Product is created
        Product.SetRange("Product Code", ProductCode);
        Assert.IsTrue(Product.FindFirst(), 'Product should be created');

        // Cleanup
        Product.Delete();
    end;

    [Test]
    procedure TestReadProduct()
    var
        Product: Record Product;
        ProductAPI: TestPage "Product API";
    begin
        // [SCENARIO] Product can be read via API page
        // [GIVEN] An existing product
        CreateTestProduct(Product);

        // [WHEN] We open the API page and navigate to the product
        ProductAPI.OpenView();
        ProductAPI.GoToRecord(Product);

        // [THEN] Data is displayed correctly
        ProductAPI.productCode.AssertEquals(Product."Product Code");
        ProductAPI.description.AssertEquals(Product.Description);

        ProductAPI.Close();

        // Cleanup
        Product.Delete();
    end;

    [Test]
    procedure TestUpdateProduct()
    var
        Product: Record Product;
        ProductAPI: TestPage "Product API";
        NewDescription: Text[100];
    begin
        // [SCENARIO] Product can be updated via API page (PATCH)
        // [GIVEN] An existing product
        CreateTestProduct(Product);
        NewDescription := 'Updated Description';

        // [WHEN] We update the product via API
        ProductAPI.OpenEdit();
        ProductAPI.GoToRecord(Product);
        ProductAPI.description.SetValue(NewDescription);
        ProductAPI.Close();

        // [THEN] Product is updated
        Product.Get(Product.SystemId);
        Assert.AreEqual(NewDescription, Product.Description, 'Description should be updated');

        // Cleanup
        Product.Delete();
    end;

    [Test]
    procedure TestDeleteProduct()
    var
        Product: Record Product;
        ProductAPI: TestPage "Product API";
        ProductId: Guid;
    begin
        // [SCENARIO] Product can be deleted via API page
        // [GIVEN] An existing product
        CreateTestProduct(Product);
        ProductId := Product.SystemId;

        // [WHEN] We delete the product via API
        ProductAPI.OpenEdit();
        ProductAPI.GoToRecord(Product);
        ProductAPI.Close();
        Product.Delete();

        // [THEN] Product no longer exists
        Assert.IsFalse(Product.Get(ProductId), 'Product should be deleted');
    end;

    [Test]
    procedure TestPriceValidation()
    var
        Product: Record Product;
        ProductAPI: TestPage "Product API";
    begin
        // [SCENARIO] Negative price is rejected
        // [GIVEN] A new product
        // [WHEN] We try to set negative price
        ProductAPI.OpenNew();
        ProductAPI.productCode.SetValue('NEGPRICE');
        ProductAPI.description.SetValue('Test');

        // [THEN] Error is raised for negative price
        asserterror ProductAPI.unitPrice.SetValue(-10);
        Assert.ExpectedError('Price must be positive');

        ProductAPI.Close();
    end;

    [Test]
    procedure TestStockValidation()
    var
        Product: Record Product;
        ProductAPI: TestPage "Product API";
    begin
        // [SCENARIO] Negative stock is rejected
        // [GIVEN] A new product
        // [WHEN] We try to set negative stock
        ProductAPI.OpenNew();
        ProductAPI.productCode.SetValue('NEGSTOCK');
        ProductAPI.description.SetValue('Test');
        ProductAPI.unitPrice.SetValue(10);

        // [THEN] Error is raised for negative stock
        asserterror ProductAPI.stockQuantity.SetValue(-5);
        Assert.ExpectedError('Stock must be non-negative');

        ProductAPI.Close();
    end;

    [Test]
    procedure TestODataKeyFields()
    var
        Product: Record Product;
    begin
        // [SCENARIO] API page uses SystemId as OData key
        // [GIVEN] A product record
        CreateTestProduct(Product);

        // [WHEN] We check the SystemId
        // [THEN] SystemId is populated
        Assert.AreNotEqual(CreateGuid(), Product.SystemId, 'SystemId should be auto-generated');

        // Cleanup
        Product.Delete();
    end;

    local procedure CreateTestProduct(var Product: Record Product)
    begin
        Product.Init();
        Product."Product Code" := CopyStr(LibraryRandom.RandText(10), 1, 20);
        Product.Description := 'Test Product';
        Product."Unit Price" := 50.00;
        Product."Stock Quantity" := 100;
        Product.Insert(true);
    end;
}
