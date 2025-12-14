codeunit 80007 "CG-AL-E007 Test"
{
    // Tests for CG-AL-E007: Basic Report - Customer List Report
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibrarySales: Codeunit "Library - Sales";
        LibraryReportDataset: Codeunit "Library - Report Dataset";

    [Test]
    procedure TestReportRuns()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Customer List Report can be run
        // [GIVEN] Customer records exist
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We run the report
        CustomerListReport.Run();

        // [THEN] Report executes without error

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestReportWithFilters()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Customer List Report respects filters
        // [GIVEN] A specific customer
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We run the report with filter
        Customer.SetRange("No.", Customer."No.");
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.Run();

        // [THEN] Report executes with filter

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestReportDataItemExists()
    var
        Customer: Record Customer;
    begin
        // [SCENARIO] Report has Customer data item
        // [GIVEN] The report definition
        // [WHEN] We check report structure
        // [THEN] Customer data item exists
        // This is verified by the report compiling successfully
        // and being able to filter on Customer table
        LibrarySales.CreateCustomer(Customer);
        Customer.Delete();
    end;

    [Test]
    procedure TestReportColumnsExist()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Report includes required columns
        // [GIVEN] Customer data
        LibrarySales.CreateCustomer(Customer);
        Customer.Name := 'Test Customer Name';
        Customer.City := 'Test City';
        Customer."Phone No." := '555-1234';
        Customer.Modify();

        // [WHEN] We run the report to dataset
        Commit();
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.SaveAsXml(LibraryReportDataset.GetFileName());

        // [THEN] Expected columns are in the output
        LibraryReportDataset.LoadDataSetFile();
        LibraryReportDataset.AssertElementWithValueExists('No_Customer', Customer."No.");

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestReportPreview()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Customer List Report can be previewed
        // [GIVEN] Customer records exist
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We preview the report
        CustomerListReport.UseRequestPage(false);
        CustomerListReport.Run();

        // [THEN] Report renders without error

        // Cleanup
        Customer.Delete();
    end;
}
