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
    procedure TestReportCanBeRun()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
        ReportRan: Boolean;
    begin
        // [SCENARIO] Customer List Report can be run without errors
        // [GIVEN] Customer records exist
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We run the report
        Commit();
        ReportRan := true;
        CustomerListReport.UseRequestPage(false);
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.Run();

        // [THEN] Report executes without error
        Assert.IsTrue(ReportRan, 'Report should run without error');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestNoCustomerColumn()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Report includes No_Customer column with Customer No.
        // [GIVEN] A customer with a known number
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We run the report to dataset
        Commit();
        Customer.SetRange("No.", Customer."No.");
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.SaveAsXml(LibraryReportDataset.GetFileName());

        // [THEN] No_Customer column exists with correct value
        LibraryReportDataset.LoadDataSetFile();
        LibraryReportDataset.AssertElementWithValueExists('No_Customer', Customer."No.");

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestNameCustomerColumn()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
        TestName: Text[100];
    begin
        // [SCENARIO] Report includes Name_Customer column with Customer Name
        // [GIVEN] A customer with a specific name
        LibrarySales.CreateCustomer(Customer);
        TestName := 'Test Customer For Report';
        Customer.Name := TestName;
        Customer.Modify();

        // [WHEN] We run the report to dataset
        Commit();
        Customer.SetRange("No.", Customer."No.");
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.SaveAsXml(LibraryReportDataset.GetFileName());

        // [THEN] Name_Customer column exists with correct value
        LibraryReportDataset.LoadDataSetFile();
        LibraryReportDataset.AssertElementWithValueExists('Name_Customer', TestName);

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestCityCustomerColumn()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
        TestCity: Text[30];
    begin
        // [SCENARIO] Report includes City_Customer column with Customer City
        // [GIVEN] A customer with a specific city
        LibrarySales.CreateCustomer(Customer);
        TestCity := 'Test City ABC';
        Customer.City := TestCity;
        Customer.Modify();

        // [WHEN] We run the report to dataset
        Commit();
        Customer.SetRange("No.", Customer."No.");
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.SaveAsXml(LibraryReportDataset.GetFileName());

        // [THEN] City_Customer column exists with correct value
        LibraryReportDataset.LoadDataSetFile();
        LibraryReportDataset.AssertElementWithValueExists('City_Customer', TestCity);

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestPhoneNoCustomerColumn()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
        TestPhone: Text[30];
    begin
        // [SCENARIO] Report includes PhoneNo_Customer column with Customer Phone No.
        // [GIVEN] A customer with a specific phone number
        LibrarySales.CreateCustomer(Customer);
        TestPhone := '555-123-4567';
        Customer."Phone No." := TestPhone;
        Customer.Modify();

        // [WHEN] We run the report to dataset
        Commit();
        Customer.SetRange("No.", Customer."No.");
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.SaveAsXml(LibraryReportDataset.GetFileName());

        // [THEN] PhoneNo_Customer column exists with correct value
        LibraryReportDataset.LoadDataSetFile();
        LibraryReportDataset.AssertElementWithValueExists('PhoneNo_Customer', TestPhone);

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestAllColumnsInSingleReport()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Report includes all four required columns
        // [GIVEN] A customer with all fields populated
        LibrarySales.CreateCustomer(Customer);
        Customer.Name := 'Complete Test Customer';
        Customer.City := 'Complete City';
        Customer."Phone No." := '999-888-7777';
        Customer.Modify();

        // [WHEN] We run the report to dataset
        Commit();
        Customer.SetRange("No.", Customer."No.");
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.SaveAsXml(LibraryReportDataset.GetFileName());

        // [THEN] All required columns exist with correct values
        LibraryReportDataset.LoadDataSetFile();
        LibraryReportDataset.AssertElementWithValueExists('No_Customer', Customer."No.");
        LibraryReportDataset.AssertElementWithValueExists('Name_Customer', 'Complete Test Customer');
        LibraryReportDataset.AssertElementWithValueExists('City_Customer', 'Complete City');
        LibraryReportDataset.AssertElementWithValueExists('PhoneNo_Customer', '999-888-7777');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestReportWithFilteredCustomers()
    var
        Customer1: Record Customer;
        Customer2: Record Customer;
        CustomerFilter: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Report correctly filters to show only selected customers
        // [GIVEN] Two customers exist
        LibrarySales.CreateCustomer(Customer1);
        Customer1.Name := 'First Customer';
        Customer1.Modify();

        LibrarySales.CreateCustomer(Customer2);
        Customer2.Name := 'Second Customer';
        Customer2.Modify();

        // [WHEN] We run the report filtered to only Customer1
        Commit();
        CustomerFilter.SetRange("No.", Customer1."No.");
        CustomerListReport.SetTableView(CustomerFilter);
        CustomerListReport.SaveAsXml(LibraryReportDataset.GetFileName());

        // [THEN] Only Customer1's data appears in the report
        LibraryReportDataset.LoadDataSetFile();
        LibraryReportDataset.AssertElementWithValueExists('No_Customer', Customer1."No.");
        LibraryReportDataset.AssertElementWithValueExists('Name_Customer', 'First Customer');

        // Cleanup
        Customer1.Delete();
        Customer2.Delete();
    end;
}
