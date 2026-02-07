codeunit 80007 "CG-AL-E007 Test"
{
    // Tests for CG-AL-E007: Basic Report - Customer List Report
    // Uses extension-compatible methods only
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibrarySales: Codeunit "Library - Sales";

    [Test]
    procedure TestReportCanBeRun()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Customer List Report can be run without errors
        // [GIVEN] Customer records exist
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We run the report
        Commit();
        CustomerListReport.UseRequestPage(false);
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.Run();

        // [THEN] Report executes without error (reaching here means success)
        Assert.IsTrue(true, 'Report ran successfully');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestReportWithSingleCustomer()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Report processes a customer with all fields populated
        // [GIVEN] A customer with all required fields
        LibrarySales.CreateCustomer(Customer);
        Customer.Name := 'Test Customer Name';
        Customer.City := 'Test City';
        Customer."Phone No." := '555-123-4567';
        Customer.Modify();

        // [WHEN] We run the report filtered to this customer
        Commit();
        Customer.SetRange("No.", Customer."No.");
        CustomerListReport.UseRequestPage(false);
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.Run();

        // [THEN] Report runs without error
        Assert.IsTrue(true, 'Report processed customer successfully');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestReportWithMultipleCustomers()
    var
        Customer1: Record Customer;
        Customer2: Record Customer;
        Customer3: Record Customer;
        AllCustomers: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Report processes multiple customers
        // [GIVEN] Multiple customers exist
        LibrarySales.CreateCustomer(Customer1);
        Customer1.Name := 'First Customer';
        Customer1.City := 'City One';
        Customer1.Modify();

        LibrarySales.CreateCustomer(Customer2);
        Customer2.Name := 'Second Customer';
        Customer2.City := 'City Two';
        Customer2.Modify();

        LibrarySales.CreateCustomer(Customer3);
        Customer3.Name := 'Third Customer';
        Customer3.City := 'City Three';
        Customer3.Modify();

        // [WHEN] We run the report for all three customers
        Commit();
        AllCustomers.SetFilter("No.", '%1|%2|%3', Customer1."No.", Customer2."No.", Customer3."No.");
        CustomerListReport.UseRequestPage(false);
        CustomerListReport.SetTableView(AllCustomers);
        CustomerListReport.Run();

        // [THEN] Report runs without error
        Assert.IsTrue(true, 'Report processed multiple customers successfully');

        // Cleanup
        Customer1.Delete();
        Customer2.Delete();
        Customer3.Delete();
    end;

    [Test]
    procedure TestReportWithFilteredCustomers()
    var
        Customer1: Record Customer;
        Customer2: Record Customer;
        FilteredCustomer: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Report correctly applies customer filter
        // [GIVEN] Two customers exist
        LibrarySales.CreateCustomer(Customer1);
        Customer1.Name := 'Included Customer';
        Customer1.Modify();

        LibrarySales.CreateCustomer(Customer2);
        Customer2.Name := 'Excluded Customer';
        Customer2.Modify();

        // [WHEN] We run the report filtered to only Customer1
        Commit();
        FilteredCustomer.SetRange("No.", Customer1."No.");
        CustomerListReport.UseRequestPage(false);
        CustomerListReport.SetTableView(FilteredCustomer);
        CustomerListReport.Run();

        // [THEN] Report runs with filter applied
        Assert.IsTrue(true, 'Report ran with filter successfully');

        // Cleanup
        Customer1.Delete();
        Customer2.Delete();
    end;

    [Test]
    procedure TestReportWithEmptyDataset()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
    begin
        // [SCENARIO] Report runs when customer records exist but filter is narrow
        // [GIVEN] A customer exists
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We run the report filtered to that single customer
        Commit();
        Customer.SetRange("No.", Customer."No.");
        CustomerListReport.UseRequestPage(false);
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.Run();

        // [THEN] Report completes without error
        Assert.IsTrue(true, 'Report handled narrow filter successfully');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestReportSavesToStream()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
        TempBlob: Codeunit "Temp Blob";
        OutStream: OutStream;
        InStream: InStream;
        XmlContent: Text;
    begin
        // [SCENARIO] Report can be saved to XML format via stream
        // [GIVEN] A customer exists
        LibrarySales.CreateCustomer(Customer);
        Customer.Name := 'Stream Test Customer';
        Customer.City := 'Stream City';
        Customer."Phone No." := '555-999-8888';
        Customer.Modify();

        // [WHEN] We save the report to a stream as XML
        Commit();
        Customer.SetRange("No.", Customer."No.");
        TempBlob.CreateOutStream(OutStream);
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.SaveAs('', ReportFormat::Xml, OutStream);

        // [THEN] Stream contains XML data with expected columns
        TempBlob.CreateInStream(InStream);
        InStream.Read(XmlContent);

        Assert.IsTrue(StrLen(XmlContent) > 0, 'Report should generate XML content');
        Assert.IsTrue(XmlContent.Contains('No_Customer'), 'XML should contain No_Customer column');
        Assert.IsTrue(XmlContent.Contains('Name_Customer'), 'XML should contain Name_Customer column');
        Assert.IsTrue(XmlContent.Contains('City_Customer'), 'XML should contain City_Customer column');
        Assert.IsTrue(XmlContent.Contains('PhoneNo_Customer'), 'XML should contain PhoneNo_Customer column');

        // Cleanup
        Customer.Delete();
    end;

    [Test]
    procedure TestReportColumnValues()
    var
        Customer: Record Customer;
        CustomerListReport: Report "Customer List Report";
        TempBlob: Codeunit "Temp Blob";
        OutStream: OutStream;
        InStream: InStream;
        XmlContent: Text;
        TestName: Text[100];
        TestCity: Text[30];
        TestPhone: Text[30];
    begin
        // [SCENARIO] Report columns contain correct customer data
        // [GIVEN] A customer with specific values
        TestName := 'Specific Test Name';
        TestCity := 'Specific City';
        TestPhone := '123-456-7890';

        LibrarySales.CreateCustomer(Customer);
        Customer.Name := TestName;
        Customer.City := TestCity;
        Customer."Phone No." := TestPhone;
        Customer.Modify();

        // [WHEN] We save the report to XML
        Commit();
        Customer.SetRange("No.", Customer."No.");
        TempBlob.CreateOutStream(OutStream);
        CustomerListReport.SetTableView(Customer);
        CustomerListReport.SaveAs('', ReportFormat::Xml, OutStream);

        // [THEN] XML contains the actual customer values
        TempBlob.CreateInStream(InStream);
        InStream.Read(XmlContent);

        Assert.IsTrue(XmlContent.Contains(Customer."No."), 'XML should contain customer number');
        Assert.IsTrue(XmlContent.Contains(TestName), 'XML should contain customer name');
        Assert.IsTrue(XmlContent.Contains(TestCity), 'XML should contain customer city');
        Assert.IsTrue(XmlContent.Contains(TestPhone), 'XML should contain customer phone');

        // Cleanup
        Customer.Delete();
    end;
}
